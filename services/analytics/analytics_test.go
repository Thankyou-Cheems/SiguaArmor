package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

var fixedNow = time.Date(2026, 9, 27, 12, 0, 0, 0, time.UTC)

func testSecret() []byte {
	return bytes.Repeat([]byte{1}, 32)
}

func testStore(t *testing.T) *dauStore {
	t.Helper()
	store, err := newDauStore(t.TempDir(), testSecret(), 30, fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	return store
}

func TestIdentityMatchesExistingNodeRecords(t *testing.T) {
	store := testStore(t)
	if got := hex.EncodeToString(store.identityKey[:]); got != "a4751a9c7e4868c0ae20d90bcad19b4f04076c3444c0440ba4233054d534fec7" {
		t.Fatalf("identity key changed: %s", got)
	}
	if got := hex.EncodeToString(store.encryptionKey[:]); got != "f3cb15f397dc592027f9b7d1a0c5d2f8ad8f98adfa889bf137b754553a3c6853" {
		t.Fatalf("IP encryption key changed: %s", got)
	}
	if got := store.visitorID("2026-09-27", "203.0.113.2"); got != "38c9104a34346cb2cbc127e832516968ab253bb8d6ec8a3f49de5e68a59a3986" {
		t.Fatalf("daily visitor ID changed: %s", got)
	}
}

func TestRecordEncryptsIPAndDeduplicatesAcrossRestart(t *testing.T) {
	store := testStore(t)
	if recorded, err := store.record("203.0.113.2", fixedNow); err != nil || !recorded {
		t.Fatalf("first record: %t, %v", recorded, err)
	}
	if recorded, err := store.record("203.0.113.2", fixedNow); err != nil || recorded {
		t.Fatalf("duplicate record: %t, %v", recorded, err)
	}
	if got := store.snapshot(1, fixedNow)[0].DAU; got != 1 {
		t.Fatalf("DAU = %d", got)
	}
	rawPath := filepath.Join(store.dir, "dau-2026-09-27.ndjson")
	raw, err := os.ReadFile(rawPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("203.0.113.2")) || bytes.Contains(raw, []byte("city")) {
		t.Fatal("raw record leaked a plain IP or legacy location")
	}
	var record map[string]json.RawMessage
	if err := json.Unmarshal(bytes.TrimSpace(raw), &record); err != nil {
		t.Fatal(err)
	}
	var version int
	if err := json.Unmarshal(record["version"], &version); err != nil || version != 4 {
		t.Fatalf("raw record version: %d, %v", version, err)
	}
	var encrypted map[string]string
	if err := json.Unmarshal(record["ip"], &encrypted); err != nil {
		t.Fatal(err)
	}
	if encrypted["algorithm"] != "A256GCM" {
		t.Fatalf("algorithm: %q", encrypted["algorithm"])
	}
	iv, _ := base64.RawURLEncoding.DecodeString(encrypted["iv"])
	ciphertext, _ := base64.RawURLEncoding.DecodeString(encrypted["ciphertext"])
	tag, _ := base64.RawURLEncoding.DecodeString(encrypted["tag"])
	block, _ := aes.NewCipher(store.encryptionKey[:])
	gcm, _ := cipher.NewGCM(block)
	ip, err := gcm.Open(nil, iv, append(ciphertext, tag...), nil)
	if err != nil || string(ip) != "203.0.113.2" {
		t.Fatalf("stored IP does not decrypt: %q, %v", ip, err)
	}
	reopened, err := newDauStore(store.dir, testSecret(), 30, fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	if recorded, err := reopened.record("203.0.113.2", fixedNow); err != nil || recorded {
		t.Fatalf("restart duplicate: %t, %v", recorded, err)
	}
	if got := reopened.snapshot(1, fixedNow)[0].DAU; got != 1 {
		t.Fatalf("restarted DAU = %d", got)
	}
}

func TestLegacyCityDataRetainsOnlyDailyTotals(t *testing.T) {
	dir := t.TempDir()
	legacyArchive := map[string]any{
		"version": 1, "date": "2026-07-01", "dau": 5, "cityThreshold": 3,
		"cities":   []any{map[string]any{"countryCode": "CN", "city": "北京市", "dau": 3}},
		"otherDau": 2,
	}
	serializedArchive, _ := json.Marshal(legacyArchive)
	if err := os.WriteFile(filepath.Join(dir, "dau-aggregate-2026-07-01.json"), append(serializedArchive, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
	raw := fmt.Sprintf("{\"version\":3,\"visitorId\":\"%s\",\"city\":{\"city\":\"北京市\"}}\n", strings.Repeat("a", 64)) +
		fmt.Sprintf("{\"version\":3,\"visitorId\":\"%s\",\"city\":null}\n", strings.Repeat("b", 64)) +
		"{\"version\":3,\"visitorId\":\"partial"
	if err := os.WriteFile(filepath.Join(dir, "dau-2026-07-02.ndjson"), []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	store, err := newDauStore(dir, testSecret(), 30, fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	days := store.overview()
	if len(days) != 2 || days[0]["dau"] != 5 || days[1]["dau"] != 2 {
		t.Fatalf("historical totals changed: %#v", days)
	}
	if _, err := os.Stat(filepath.Join(dir, "dau-2026-07-02.ndjson")); !os.IsNotExist(err) {
		t.Fatalf("expired raw record retained: %v", err)
	}
	archive, err := os.ReadFile(filepath.Join(dir, "dau-aggregate-2026-07-02.json"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(archive, []byte("city")) || !bytes.Contains(archive, []byte("\"version\":2")) {
		t.Fatalf("expired archive still contains location: %s", archive)
	}
}

func TestConcurrentRecordsHaveOneCountPerAddress(t *testing.T) {
	store := testStore(t)
	var group sync.WaitGroup
	for i := 0; i < 50; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := store.record("203.0.113.2", fixedNow); err != nil {
				t.Error(err)
			}
		}()
	}
	group.Wait()
	if got := store.snapshot(1, fixedNow)[0].DAU; got != 1 {
		t.Fatalf("concurrent duplicate counted %d times", got)
	}
}

func TestHTTPContractAndGuards(t *testing.T) {
	store := testStore(t)
	config := serverConfig{
		publicOrigin: "https://armor.siguad.icu",
		originSecret: testSecret(),
		adminSecret:  bytes.Repeat([]byte{2}, 32),
		trustEdgeIP:  true,
	}
	if !equalSecret(base64.RawURLEncoding.EncodeToString(config.originSecret), config.originSecret) {
		t.Fatal("valid origin secret rejected")
	}
	app := &dauApp{config: config, store: store, now: func() time.Time { return fixedNow }}
	server := httptest.NewServer(app)
	defer server.Close()
	client := server.Client()
	request := func(method, path, origin, ip string, body []byte, authorized bool) *http.Response {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+path, bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if ip != "" {
			req.Header.Set("EO-Connecting-IP", ip)
		}
		if authorized {
			req.Header.Set("X-Sigua-Origin-Auth", base64.RawURLEncoding.EncodeToString(config.originSecret))
		}
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return response
	}
	if response := request("GET", "/__analytics/dau", "", "", nil, false); response.StatusCode != 403 {
		t.Fatalf("unauthorized public status = %d", response.StatusCode)
	} else {
		response.Body.Close()
	}
	if response := request("POST", "/__analytics/dau", "https://evil.example", "203.0.113.2", nil, true); response.StatusCode != 403 {
		t.Fatalf("cross-origin status = %d", response.StatusCode)
	} else {
		response.Body.Close()
	}
	if response := request("POST", "/__analytics/dau", config.publicOrigin, "203.0.113.2", bytes.Repeat([]byte{'x'}, 65), true); response.StatusCode != 413 {
		t.Fatalf("oversized status = %d", response.StatusCode)
	} else {
		response.Body.Close()
	}
	for i := 0; i < 2; i++ {
		response := request("POST", "/__analytics/dau", config.publicOrigin, "203.0.113.2", nil, true)
		if response.StatusCode != 200 {
			t.Fatalf("valid POST status = %d", response.StatusCode)
		}
		var public map[string]any
		if err := json.NewDecoder(response.Body).Decode(&public); err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if public["schemaVersion"] != "sigua-public-dau/v1" || public["dau"] != float64(1) {
			t.Fatalf("public response: %#v", public)
		}
	}
	adminReq, _ := http.NewRequest("GET", server.URL+"/__analytics/admin/overview", nil)
	adminReq.Header.Set("X-Sigua-Admin-Proxy", base64.RawURLEncoding.EncodeToString(config.adminSecret))
	adminResponse, err := client.Do(adminReq)
	if err != nil {
		t.Fatal(err)
	}
	defer adminResponse.Body.Close()
	var admin map[string]any
	if err := json.NewDecoder(adminResponse.Body).Decode(&admin); err != nil {
		t.Fatal(err)
	}
	if adminResponse.StatusCode != 200 || admin["schemaVersion"] != "sigua-admin-dau-overview/v2" ||
		len(admin["days"].([]any)) != 1 {
		t.Fatalf("admin response: %#v", admin)
	}
	serialized, _ := json.Marshal(admin)
	if bytes.Contains(serialized, []byte("203.0.113.2")) || bytes.Contains(serialized, []byte("city")) {
		t.Fatal("admin overview leaks IP or location")
	}
}

func TestIPNormalizationPreservesExistingIdentity(t *testing.T) {
	cases := map[string]string{
		" 203.0.113.2 ":        "203.0.113.2",
		"::ffff:203.0.113.2":   "203.0.113.2",
		"2001:0DB8::1":         "2001:0db8::1",
		"203.0.113.2, 1.2.3.4": "",
		"not-an-ip":            "",
	}
	for input, want := range cases {
		if got := normalizeClientIP(input); got != want {
			t.Errorf("normalizeClientIP(%q) = %q, want %q", input, got, want)
		}
	}
}
