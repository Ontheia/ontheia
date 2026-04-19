# Connection Tests & Diagnosis

To ensure that the configured providers are ready for use, Ontheia offers integrated test tools.

## 1. Test Configuration
In the provider details, you can specify how reachability should be checked:
- **Test Path:** The endpoint for the check (Default: `/v1/models`).
- **HTTP Method:** `GET` (list models) or `POST` (send a short chat request).
- **Test Model ID:** For `POST`, this ID is used for a test completion.

## 2. Status Indicators
In the list of registered providers, you can immediately see the state:
- **Green (Connected):** The last test was successful (status 2xx).
- **Red (Error):** The API is not reachable or authentication failed.
- **Gray (Unknown):** No connection test has been performed yet.

## 3. Performance Metrics
After a successful test, Ontheia displays additional information:
- **Duration (ms):** The latency of the API response.
- **Warnings:** Hints from the API (e.g., deprecation warnings).
- **Response Preview:** A snippet of the raw response to validate the API structure.
