package main

import (
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const rawPrefix = "dau-"
const archivePrefix = "dau-aggregate-"
const dayPattern = "2006-01-02"

type dayAggregate struct {
	Date string
	DAU  int
}

func (day dayAggregate) payload() map[string]any {
	return map[string]any{"version": 2, "date": day.Date, "dau": day.DAU}
}

type dauStore struct {
	mu            sync.Mutex
	dir           string
	retentionDays int
	identityKey   [32]byte
	encryptionKey [32]byte
	visitors      map[string]map[string]struct{}
	archives      map[string]dayAggregate
}

func deriveKey(secret []byte, purpose string) [32]byte {
	extract := hmac.New(sha256.New, []byte("sigua-review-dau-v1"))
	extract.Write(secret)
	prk := extract.Sum(nil)
	expand := hmac.New(sha256.New, prk)
	expand.Write([]byte(purpose))
	expand.Write([]byte{1})
	var key [32]byte
	copy(key[:], expand.Sum(nil))
	return key
}

func newDauStore(dir string, secret []byte, retentionDays int, at time.Time) (*dauStore, error) {
	store := &dauStore{
		dir:           dir,
		retentionDays: retentionDays,
		identityKey:   deriveKey(secret, "daily-visitor-id"),
		encryptionKey: deriveKey(secret, "ip-encryption"),
		visitors:      make(map[string]map[string]struct{}),
		archives:      make(map[string]dayAggregate),
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		date, ok := dateFromFile(entry.Name(), archivePrefix, ".json")
		if !ok {
			continue
		}
		archive, err := loadArchive(filepath.Join(dir, entry.Name()), date)
		if err != nil {
			return nil, err
		}
		store.archives[date] = archive
	}
	cutoff := dayOffset(at, retentionDays-1)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		date, ok := dateFromFile(entry.Name(), rawPrefix, ".ndjson")
		if !ok {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		if date < cutoff {
			if err := store.compactRaw(date, path); err != nil {
				return nil, err
			}
		} else {
			visitors, err := loadRaw(path)
			if err != nil {
				return nil, err
			}
			store.visitors[date] = visitors
		}
	}
	return store, nil
}

func dateFromFile(name, prefix, suffix string) (string, bool) {
	if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, suffix) ||
		len(name) != len(prefix)+len(dayPattern)+len(suffix) {
		return "", false
	}
	date := name[len(prefix) : len(name)-len(suffix)]
	parsed, err := time.Parse(dayPattern, date)
	return date, err == nil && parsed.Format(dayPattern) == date
}

func dayOffset(at time.Time, offset int) string {
	return at.UTC().AddDate(0, 0, -offset).Format(dayPattern)
}

func requiredInt(value map[string]json.RawMessage, key string) (int, error) {
	raw, ok := value[key]
	if !ok || string(raw) == "null" {
		return 0, fmt.Errorf("missing %s", key)
	}
	var parsed int
	if err := json.Unmarshal(raw, &parsed); err != nil || parsed < 0 {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return parsed, nil
}

func loadArchive(path, expectedDate string) (dayAggregate, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return dayAggregate{}, err
	}
	var value map[string]json.RawMessage
	if err := json.Unmarshal(bytes, &value); err != nil {
		return dayAggregate{}, fmt.Errorf("invalid DAU archive for %s: %w", expectedDate, err)
	}
	var version int
	var date string
	if err := json.Unmarshal(value["version"], &version); err != nil {
		return dayAggregate{}, fmt.Errorf("invalid DAU archive version for %s", expectedDate)
	}
	if err := json.Unmarshal(value["date"], &date); err != nil || date != expectedDate {
		return dayAggregate{}, fmt.Errorf("invalid DAU archive date for %s", expectedDate)
	}
	dau, err := requiredInt(value, "dau")
	if err != nil {
		return dayAggregate{}, fmt.Errorf("invalid DAU archive for %s: %w", expectedDate, err)
	}
	if version == 1 {
		threshold, thresholdErr := requiredInt(value, "cityThreshold")
		other, otherErr := requiredInt(value, "otherDau")
		var cities []map[string]json.RawMessage
		citiesErr := json.Unmarshal(value["cities"], &cities)
		if thresholdErr != nil || otherErr != nil || threshold < 3 || threshold > 100 ||
			citiesErr != nil || cities == nil {
			return dayAggregate{}, fmt.Errorf("invalid legacy DAU archive for %s", expectedDate)
		}
		sum := other
		for _, city := range cities {
			count, err := requiredInt(city, "dau")
			if err != nil || count < threshold {
				return dayAggregate{}, fmt.Errorf("invalid legacy DAU archive for %s", expectedDate)
			}
			sum += count
		}
		if sum != dau {
			return dayAggregate{}, fmt.Errorf("invalid legacy DAU archive for %s", expectedDate)
		}
	} else if version != 2 {
		return dayAggregate{}, fmt.Errorf("unsupported DAU archive for %s", expectedDate)
	}
	return dayAggregate{Date: expectedDate, DAU: dau}, nil
}

func validVisitorID(id string) bool {
	if len(id) != 64 {
		return false
	}
	for _, char := range id {
		if !(char >= '0' && char <= '9' || char >= 'a' && char <= 'f') {
			return false
		}
	}
	return true
}

func loadRaw(path string) (map[string]struct{}, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	visitors := make(map[string]struct{})
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		var record map[string]json.RawMessage
		if json.Unmarshal(scanner.Bytes(), &record) != nil {
			continue
		}
		var id string
		if json.Unmarshal(record["visitorId"], &id) == nil && validVisitorID(id) {
			visitors[id] = struct{}{}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return visitors, nil
}

func syncDirectory(dir string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	handle, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer handle.Close()
	return handle.Sync()
}

func atomicWriteJSON(path string, value any) error {
	file, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err := file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	bytes, err := json.Marshal(value)
	if err != nil {
		file.Close()
		return err
	}
	bytes = append(bytes, '\n')
	if _, err := file.Write(bytes); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(path))
}

func (store *dauStore) compactRaw(date, path string) error {
	visitors, err := loadRaw(path)
	if err != nil {
		return err
	}
	archive := dayAggregate{Date: date, DAU: len(visitors)}
	archivePath := filepath.Join(store.dir, archivePrefix+date+".json")
	if err := atomicWriteJSON(archivePath, archive.payload()); err != nil {
		return err
	}
	if err := os.Remove(path); err != nil {
		return err
	}
	if err := syncDirectory(store.dir); err != nil {
		return err
	}
	delete(store.visitors, date)
	store.archives[date] = archive
	return nil
}

func (store *dauStore) prune(at time.Time) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	cutoff := dayOffset(at, store.retentionDays-1)
	entries, err := os.ReadDir(store.dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if date, ok := dateFromFile(entry.Name(), rawPrefix, ".ndjson"); ok && date < cutoff {
			if err := store.compactRaw(date, filepath.Join(store.dir, entry.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}

func (store *dauStore) visitorID(date, ip string) string {
	h := hmac.New(sha256.New, store.identityKey[:])
	h.Write([]byte(date))
	h.Write([]byte{0})
	h.Write([]byte(ip))
	return hex.EncodeToString(h.Sum(nil))
}

func (store *dauStore) encryptedIP(ip string) (map[string]string, error) {
	block, err := aes.NewCipher(store.encryptionKey[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return nil, err
	}
	sealed := gcm.Seal(nil, iv, []byte(ip), nil)
	tagOffset := len(sealed) - gcm.Overhead()
	return map[string]string{
		"algorithm":  "A256GCM",
		"iv":         base64.RawURLEncoding.EncodeToString(iv),
		"ciphertext": base64.RawURLEncoding.EncodeToString(sealed[:tagOffset]),
		"tag":        base64.RawURLEncoding.EncodeToString(sealed[tagOffset:]),
	}, nil
}

func appendRecord(path string, record any) error {
	bytes, err := json.Marshal(record)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	var prefix []byte
	size, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return err
	}
	if size > 0 {
		var last [1]byte
		if _, err := file.ReadAt(last[:], size-1); err != nil {
			return err
		}
		if last[0] != '\n' {
			prefix = []byte{'\n'}
		}
	}
	bytes = append(prefix, bytes...)
	bytes = append(bytes, '\n')
	if _, err := file.Write(bytes); err != nil {
		return err
	}
	return file.Sync()
}

func (store *dauStore) record(ip string, at time.Time) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	date := at.UTC().Format(dayPattern)
	id := store.visitorID(date, ip)
	visitors := store.visitors[date]
	if _, seen := visitors[id]; seen {
		return false, nil
	}
	encrypted, err := store.encryptedIP(ip)
	if err != nil {
		return false, err
	}
	record := map[string]any{
		"version": 4, "date": date, "visitorId": id,
		"firstSeen": at.UTC().Format("2006-01-02T15:04:05.000Z"),
		"ip":        encrypted,
	}
	if err := appendRecord(filepath.Join(store.dir, rawPrefix+date+".ndjson"), record); err != nil {
		return false, err
	}
	if visitors == nil {
		visitors = make(map[string]struct{})
		store.visitors[date] = visitors
	}
	visitors[id] = struct{}{}
	return true, nil
}

func (store *dauStore) snapshot(days int, at time.Time) []dayAggregate {
	store.mu.Lock()
	defer store.mu.Unlock()
	result := make([]dayAggregate, days)
	for index := range result {
		date := dayOffset(at, days-index-1)
		result[index] = store.day(date)
	}
	return result
}

func (store *dauStore) day(date string) dayAggregate {
	if visitors, ok := store.visitors[date]; ok {
		return dayAggregate{Date: date, DAU: len(visitors)}
	}
	if archive, ok := store.archives[date]; ok {
		return archive
	}
	return dayAggregate{Date: date, DAU: 0}
}

func (store *dauStore) overview() []map[string]any {
	store.mu.Lock()
	defer store.mu.Unlock()
	dates := make(map[string]struct{}, len(store.visitors)+len(store.archives))
	for date := range store.visitors {
		dates[date] = struct{}{}
	}
	for date := range store.archives {
		dates[date] = struct{}{}
	}
	sorted := make([]string, 0, len(dates))
	for date := range dates {
		sorted = append(sorted, date)
	}
	sort.Strings(sorted)
	result := make([]map[string]any, 0, len(sorted))
	for _, date := range sorted {
		result = append(result, store.day(date).payload())
	}
	return result
}

func (store *dauStore) maintainUntil(stop <-chan struct{}, now func() time.Time, onError func(error)) {
	for {
		current := now().UTC()
		next := time.Date(current.Year(), current.Month(), current.Day()+1, 0, 0, 0, 0, time.UTC)
		timer := time.NewTimer(time.Until(next))
		select {
		case <-stop:
			timer.Stop()
			return
		case <-timer.C:
			if err := store.prune(now()); err != nil && !errors.Is(err, os.ErrNotExist) {
				onError(err)
			}
		}
	}
}
