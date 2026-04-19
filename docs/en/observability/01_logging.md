# Logging & Log Rotation

Ontheia uses a structured logging system (based on `pino`) that supports both the console (stdout) and rotating files on the file system.

## 1. Configuration

Logging is controlled via environment variables in the `.env` file.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `LOG_LEVEL` | Logging detail level (`debug`, `info`, `warn`, `error`). | `info` |
| `PINO_PRETTY` | Set to `true` for colorized, human-readable log output on the console (recommended for development only). | `false` |
| `LOG_FILE` | Path to the log file on the host/container. | `<cwd>/host_server.log` |
| `LOG_MAX_BYTES` | Maximum size of a log file in bytes before rotation. | `10485760` (10 MB) |
| `LOG_MAX_FILES` | Number of rotated log files to keep (older ones will be deleted). | `5` |

## 2. How Log Rotation Works

Ontheia implements its own log rotation (`log-rotate.ts`) to ensure that the disk does not fill up with infinitely growing log files.

1.  **Writing:** All logs are continuously appended to the end of the file defined in `LOG_FILE`.
2.  **Checking:** With every write operation, the system checks whether the current file size has exceeded `LOG_MAX_BYTES`.
3.  **Rotation:** Once the limit is reached:
    - The current file is closed.
    - The file is renamed to `LOG_FILE.YYYY-MM-DDTHH-mm-ss-SSSZ` (with the current timestamp).
    - A new, empty `LOG_FILE` is opened.
4.  **Cleanup:** The system checks the directory for older rotated files. It keeps only the latest `LOG_MAX_FILES` files and permanently deletes any additional archives.

## 3. Reading the Logs

### In Docker Environments
When Ontheia is running in Docker, the standard logs (console) can be viewed as usual:
```bash
docker compose logs -f host
```
The rotating files are located inside the container at the path specified in `LOG_FILE` (defaulting to the app's root directory). To store these persistently, the directory should be mounted as a volume.

### In Local Installations
The logs are written directly to the file:
```bash
tail -f host_server.log
```

## 4. Log Structure (JSON)
Without `PINO_PRETTY=true`, logs are output in JSON format, which is ideal for external log aggregators (such as ELK Stack or Loki).

Example:
```json
{"level":30,"time":1710775000000,"pid":1,"hostname":"ontheia-host","msg":"Server started on port 8080"}
```
- `level: 30` corresponds to `info`.
- `time` is a Unix timestamp in milliseconds.
