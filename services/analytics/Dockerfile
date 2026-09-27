FROM scratch

COPY --chmod=0555 analytics-server /app/analytics-server

USER 1000:1000

EXPOSE 8081

ENTRYPOINT ["/app/analytics-server"]
