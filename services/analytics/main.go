package main

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const maxBodyBytes = 64

type serverConfig struct {
	publicOrigin    string
	listenHost      string
	port            int
	originSecret    []byte
	adminSecret     []byte
	analyticsDir    string
	analyticsSecret []byte
	retentionDays   int
	trustEdgeIP     bool
}

func requiredEnv(name string) (string, error) {
	value := os.Getenv(name)
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}

func base64URLSecret(name string) ([]byte, error) {
	encoded, err := requiredEnv(name)
	if err != nil {
		return nil, err
	}
	for _, char := range encoded {
		if !isBase64URLChar(char) {
			return nil, fmt.Errorf("%s must be base64url", name)
		}
	}
	secret, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || len(secret) != 32 {
		return nil, fmt.Errorf("%s must contain 256 random bits", name)
	}
	return secret, nil
}

func isBase64URLChar(char rune) bool {
	return char >= 'A' && char <= 'Z' ||
		char >= 'a' && char <= 'z' ||
		char >= '0' && char <= '9' ||
		char == '_' || char == '-'
}

func integerEnv(name string, fallback, minimum, maximum int) (int, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	for _, char := range raw {
		if char < '0' || char > '9' {
			return 0, fmt.Errorf("%s must be an integer", name)
		}
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be between %d and %d", name, minimum, maximum)
	}
	return value, nil
}

func loadConfig() (serverConfig, error) {
	var config serverConfig
	rawOrigin, err := requiredEnv("SIGUA_PUBLIC_ORIGIN")
	if err != nil {
		return config, err
	}
	origin, err := url.Parse(rawOrigin)
	if err != nil || origin.Scheme != "https" || origin.Host == "" ||
		origin.Path != "" && origin.Path != "/" || origin.User != nil ||
		origin.RawQuery != "" || origin.Fragment != "" {
		return config, errors.New("SIGUA_PUBLIC_ORIGIN must be an HTTPS origin without a path")
	}
	config.publicOrigin = "https://" + origin.Host
	config.listenHost = os.Getenv("SIGUA_ANALYTICS_LISTEN_HOST")
	if config.listenHost == "" {
		config.listenHost = "0.0.0.0"
	}
	config.port, err = integerEnv("SIGUA_ANALYTICS_PORT", 8081, 1, 65535)
	if err != nil {
		return config, err
	}
	config.originSecret, err = base64URLSecret("SIGUA_ORIGIN_AUTH_SECRET")
	if err != nil {
		return config, err
	}
	config.adminSecret, err = base64URLSecret("SIGUA_CONTENT_ADMIN_PROXY_SECRET")
	if err != nil {
		return config, err
	}
	config.analyticsDir, err = requiredEnv("SIGUA_ANALYTICS_DIR")
	if err != nil {
		return config, err
	}
	config.analyticsSecret, err = base64URLSecret("SIGUA_ANALYTICS_SECRET")
	if err != nil {
		return config, err
	}
	config.retentionDays, err = integerEnv("SIGUA_ANALYTICS_RETENTION_DAYS", 30, 1, 90)
	if err != nil {
		return config, err
	}
	config.trustEdgeIP = os.Getenv("SIGUA_TRUST_EDGEONE_CLIENT_IP") != "0"
	return config, nil
}

func equalSecret(candidate string, expected []byte) bool {
	if candidate == "" {
		return false
	}
	for _, char := range candidate {
		if !isBase64URLChar(char) {
			return false
		}
	}
	actual, err := base64.RawURLEncoding.DecodeString(candidate)
	return err == nil && len(actual) == len(expected) &&
		subtle.ConstantTimeCompare(actual, expected) == 1
}

func normalizeClientIP(value string) string {
	candidate := strings.TrimSpace(value)
	if candidate == "" || strings.Contains(candidate, ",") {
		return ""
	}
	if strings.HasPrefix(candidate, "::ffff:") {
		mapped := candidate[len("::ffff:"):]
		if address, err := netip.ParseAddr(mapped); err == nil && address.Is4() {
			candidate = mapped
		}
	}
	address, err := netip.ParseAddr(candidate)
	if err != nil || address.Zone() != "" {
		return ""
	}
	// Preserve spelling for the same daily HMAC identity as the previous Node service.
	return strings.ToLower(candidate)
}

func clientIP(request *http.Request, trustEdgeIP bool) string {
	if trustEdgeIP {
		if value := normalizeClientIP(request.Header.Get("EO-Connecting-IP")); value != "" {
			return value
		}
	}
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		host = request.RemoteAddr
	}
	return normalizeClientIP(host)
}

func send(response http.ResponseWriter, status int, contentType string, body []byte) {
	response.Header().Set("Cache-Control", "no-store, max-age=0")
	response.Header().Set("Content-Length", strconv.Itoa(len(body)))
	response.Header().Set("Content-Type", contentType)
	response.Header().Set("Referrer-Policy", "no-referrer")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.WriteHeader(status)
	response.Write(body)
}

func sendText(response http.ResponseWriter, status int, body string) {
	send(response, status, "text/plain; charset=utf-8", []byte(body))
}

func sendJSON(response http.ResponseWriter, status int, payload any) {
	bytes, err := json.Marshal(payload)
	if err != nil {
		sendText(response, 500, "Internal Server Error\n")
		return
	}
	send(response, status, "application/json; charset=utf-8", append(bytes, '\n'))
}

type dauApp struct {
	config serverConfig
	store  *dauStore
	now    func() time.Time
}

func (app *dauApp) publicSnapshot() map[string]any {
	day := app.store.snapshot(1, app.now())[0]
	return map[string]any{
		"schemaVersion": "sigua-public-dau/v1",
		"date":          day.Date,
		"dau":           day.DAU,
	}
}

func (app *dauApp) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	switch request.URL.Path {
	case "/healthz":
		sendText(response, 200, "ok\n")
		return
	case "/__analytics/admin/overview":
		if !equalSecret(request.Header.Get("X-Sigua-Admin-Proxy"), app.config.adminSecret) {
			sendText(response, 403, "Forbidden\n")
			return
		}
		if request.Method != http.MethodGet {
			response.Header().Set("Allow", "GET")
			sendText(response, 405, "Method Not Allowed\n")
			return
		}
		sendJSON(response, 200, map[string]any{
			"schemaVersion": "sigua-admin-dau-overview/v2",
			"generatedAt":   app.now().UTC().Format("2006-01-02T15:04:05.000Z"),
			"days":          app.store.overview(),
		})
		return
	case "/__analytics/dau":
		if !equalSecret(request.Header.Get("X-Sigua-Origin-Auth"), app.config.originSecret) {
			sendText(response, 403, "Forbidden\n")
			return
		}
		if request.Method == http.MethodGet {
			sendJSON(response, 200, app.publicSnapshot())
			return
		}
		if request.Method != http.MethodPost {
			response.Header().Set("Allow", "GET, POST")
			sendText(response, 405, "Method Not Allowed\n")
			return
		}
		fetchSite := request.Header.Get("Sec-Fetch-Site")
		if request.Header.Get("Origin") != app.config.publicOrigin ||
			fetchSite != "" && fetchSite != "same-origin" {
			sendText(response, 403, "Forbidden\n")
			return
		}
		received, err := io.Copy(io.Discard, io.LimitReader(request.Body, maxBodyBytes+1))
		if err != nil {
			log.Printf("DAU request body failed: %v", err)
			sendText(response, 500, "Internal Server Error\n")
			return
		}
		if received > maxBodyBytes {
			sendText(response, 413, "Payload Too Large\n")
			return
		}
		if ip := clientIP(request, app.config.trustEdgeIP); ip != "" {
			if _, err := app.store.record(ip, app.now()); err != nil {
				log.Printf("DAU record failed: %v", err)
				sendText(response, 500, "Internal Server Error\n")
				return
			}
		}
		sendJSON(response, 200, app.publicSnapshot())
		return
	default:
		sendText(response, 404, "Not Found\n")
	}
}

func healthcheck() error {
	port, err := integerEnv("SIGUA_ANALYTICS_PORT", 8081, 1, 65535)
	if err != nil {
		return err
	}
	client := &http.Client{
		Timeout:   3 * time.Second,
		Transport: &http.Transport{Proxy: nil},
	}
	response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/healthz", port))
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return fmt.Errorf("healthcheck returned %d", response.StatusCode)
	}
	return nil
}

func run() error {
	config, err := loadConfig()
	if err != nil {
		return err
	}
	store, err := newDauStore(config.analyticsDir, config.analyticsSecret, config.retentionDays, time.Now())
	if err != nil {
		return err
	}
	app := &dauApp{config: config, store: store, now: time.Now}
	server := &http.Server{
		Addr:              net.JoinHostPort(config.listenHost, strconv.Itoa(config.port)),
		Handler:           app,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       5 * time.Second,
	}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return err
	}
	stopMaintenance := make(chan struct{})
	go store.maintainUntil(stopMaintenance, time.Now, func(err error) {
		log.Printf("DAU retention failed: %v", err)
	})
	done := make(chan error, 1)
	go func() {
		done <- server.Serve(listener)
	}()
	log.Printf("[public-analytics] listening on %s", server.Addr)
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case signal := <-signals:
		log.Printf("[public-analytics] %s; draining", signal)
		close(stopMaintenance)
		context, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return server.Shutdown(context)
	case err := <-done:
		close(stopMaintenance)
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func main() {
	var err error
	if len(os.Args) == 2 && os.Args[1] == "healthcheck" {
		err = healthcheck()
	} else if len(os.Args) == 1 {
		err = run()
	} else {
		err = errors.New("usage: analytics-server [healthcheck]")
	}
	if err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
