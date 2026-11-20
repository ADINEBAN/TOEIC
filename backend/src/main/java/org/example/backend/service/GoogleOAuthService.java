package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import okhttp3.FormBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.example.backend.dto.response.AuthResponse;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class GoogleOAuthService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleOAuthService.class);

    private static final String GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    private static final String GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
    private static final String GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

    private static final long STATE_TTL_SECONDS = 300;
    private static final long HANDOFF_TTL_SECONDS = 60;

    private final ObjectMapper objectMapper;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build();

    private final SecureRandom secureRandom = new SecureRandom();
    private final Map<String, PendingOAuthState> pendingStates = new ConcurrentHashMap<>();
    private final Map<String, PendingAuthHandoff> pendingHandoffs = new ConcurrentHashMap<>();

    @Value("${google.oauth.client-id:}")
    private String googleClientId;

    @Value("${google.oauth.client-secret:}")
    private String googleClientSecret;

    @Value("${google.oauth.redirect-uri:}")
    private String configuredRedirectUri;

    public record GoogleUserInfo(String sub, String email, String fullName, String avatarUrl) {}

    public record GoogleCallbackResult(String clientRedirectUri, GoogleUserInfo userInfo) {}

    private record PendingOAuthState(String clientRedirectUri, String callbackUri, Instant expiresAt) {}

    private record PendingAuthHandoff(AuthResponse authResponse, Instant expiresAt) {}

    public Map<String, Object> getStatus() {
        boolean hasClientId = !isBlank(googleClientId);
        boolean hasClientSecret = !isBlank(googleClientSecret);
        return Map.of(
                "configured", hasClientId,
                "redirectConfigured", hasClientId && hasClientSecret
        );
    }

    public String createAuthorizationUrl(String requestCallbackUri, String clientRedirectUri) {
        if (isBlank(googleClientId) || isBlank(googleClientSecret)) {
            logger.warn("Google OAuth authorize called without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
            throw new AppException(ErrorCode.LOGIN_FAIL);
        }
        String sanitizedClientRedirect = validateClientRedirectUri(clientRedirectUri);
        String callbackUri = !isBlank(configuredRedirectUri) ? configuredRedirectUri.trim() : requestCallbackUri;

        cleanupExpiredEntries();
        String state = generateRandomToken();
        pendingStates.put(state, new PendingOAuthState(
                sanitizedClientRedirect,
                callbackUri,
                Instant.now().plusSeconds(STATE_TTL_SECONDS)
        ));

        return GOOGLE_AUTH_ENDPOINT
                + "?client_id=" + urlEncode(primaryClientId())
                + "&redirect_uri=" + urlEncode(callbackUri)
                + "&response_type=code"
                + "&scope=" + urlEncode("openid email profile")
                + "&access_type=offline"
                + "&prompt=select_account"
                + "&state=" + urlEncode(state);
    }

    public String extractPendingRedirectUri(String state) {
        if (isBlank(state)) {
            return null;
        }
        PendingOAuthState pending = pendingStates.remove(state.trim());
        if (pending == null || Instant.now().isAfter(pending.expiresAt())) {
            return null;
        }
        return pending.clientRedirectUri();
    }

    public GoogleCallbackResult exchangeCallbackCode(String code, String state) {
        if (isBlank(code) || isBlank(state)) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        PendingOAuthState pending = pendingStates.remove(state.trim());
        if (pending == null || Instant.now().isAfter(pending.expiresAt())) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        if (isBlank(googleClientId) || isBlank(googleClientSecret)) {
            throw new AppException(ErrorCode.LOGIN_FAIL);
        }

        FormBody body = new FormBody.Builder()
                .add("code", code.trim())
                .add("client_id", primaryClientId())
                .add("client_secret", googleClientSecret.trim())
                .add("redirect_uri", pending.callbackUri())
                .add("grant_type", "authorization_code")
                .build();

        Map<String, Object> tokenPayload = executeJsonRequest(
                new Request.Builder().url(GOOGLE_TOKEN_ENDPOINT).post(body).build(),
                "Google token exchange failed"
        );

        String idToken = stringValue(tokenPayload.get("id_token"));
        String accessToken = stringValue(tokenPayload.get("access_token"));
        GoogleUserInfo userInfo = verifyGoogleTokens(idToken, accessToken);
        return new GoogleCallbackResult(pending.clientRedirectUri(), userInfo);
    }

    public GoogleUserInfo verifyGoogleTokens(String idToken, String accessToken) {
        if (!isBlank(idToken)) {
            Map<String, Object> claims = executeJsonRequest(
                    new Request.Builder()
                            .url(GOOGLE_TOKENINFO_ENDPOINT + "?id_token=" + urlEncode(idToken.trim()))
                            .get()
                            .build(),
                    "Google ID token verification failed"
            );
            return validateAndBuildUserInfo(claims);
        }

        if (!isBlank(accessToken)) {
            String trimmedToken = accessToken.trim();
            Map<String, Object> tokenInfo = executeJsonRequest(
                    new Request.Builder()
                            .url(GOOGLE_TOKENINFO_ENDPOINT + "?access_token=" + urlEncode(trimmedToken))
                            .get()
                            .build(),
                    "Google access token verification failed"
            );
            assertAudienceAllowed(stringValue(tokenInfo.get("aud")), stringValue(tokenInfo.get("azp")));

            Map<String, Object> userInfoMap = executeJsonRequest(
                    new Request.Builder()
                            .url(GOOGLE_USERINFO_ENDPOINT)
                            .header("Authorization", "Bearer " + trimmedToken)
                            .get()
                            .build(),
                    "Google userinfo lookup failed"
            );
            return validateAndBuildUserInfo(userInfoMap);
        }

        throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
    }

    public String issueHandoffCode(AuthResponse authResponse) {
        cleanupExpiredEntries();
        String code = generateRandomToken();
        pendingHandoffs.put(code, new PendingAuthHandoff(
                authResponse,
                Instant.now().plusSeconds(HANDOFF_TTL_SECONDS)
        ));
        return code;
    }

    public AuthResponse consumeHandoffCode(String code) {
        if (isBlank(code)) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        PendingAuthHandoff handoff = pendingHandoffs.remove(code.trim());
        if (handoff == null || Instant.now().isAfter(handoff.expiresAt())) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        return handoff.authResponse();
    }

    public String validateClientRedirectUri(String rawUri) {
        if (isBlank(rawUri)) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        String trimmed = rawUri.trim();
        URI parsed;
        try {
            parsed = URI.create(trimmed);
        } catch (IllegalArgumentException ex) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }

        String scheme = parsed.getScheme() != null ? parsed.getScheme().toLowerCase(Locale.ROOT) : "";
        String host = parsed.getHost() != null ? parsed.getHost().toLowerCase(Locale.ROOT) : "";

        boolean allowedScheme = "toeic-trainer".equals(scheme) || "exp".equals(scheme);
        boolean allowedWebOrigin = ("http".equals(scheme) && ("localhost".equals(host) || "127.0.0.1".equals(host) || host.startsWith("192.168.") || host.startsWith("10.")))
                || ("https".equals(scheme) && "toeic-trainer-api.koreacentral.cloudapp.azure.com".equals(host));

        if (!allowedScheme && !allowedWebOrigin) {
            logger.warn("Rejected Google OAuth redirect_uri: {}", trimmed);
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        return trimmed;
    }

    public String appendQueryParam(String baseUri, String key, String value) {
        String separator = baseUri.contains("?") ? "&" : "?";
        return baseUri + separator + urlEncode(key) + "=" + urlEncode(value);
    }

    protected Map<String, Object> executeJsonRequest(Request request, String errorMessage) {
        try (Response response = httpClient.newCall(request).execute()) {
            String rawBody = response.body() != null ? response.body().string() : "";
            if (!response.isSuccessful() || rawBody.isBlank()) {
                logger.warn("{}: HTTP {}", errorMessage, response.code());
                throw new AppException(ErrorCode.LOGIN_FAIL);
            }
            return objectMapper.readValue(rawBody, new TypeReference<>() {});
        } catch (AppException ex) {
            throw ex;
        } catch (IOException ex) {
            logger.warn("{}: {}", errorMessage, ex.getMessage());
            throw new AppException(ErrorCode.LOGIN_FAIL);
        }
    }

    private GoogleUserInfo validateAndBuildUserInfo(Map<String, Object> claims) {
        assertAudienceAllowed(stringValue(claims.get("aud")), stringValue(claims.get("azp")));

        Object verifiedRaw = claims.get("email_verified");
        boolean emailVerified = verifiedRaw instanceof Boolean b
                ? b
                : "true".equalsIgnoreCase(String.valueOf(verifiedRaw));
        String email = stringValue(claims.get("email")).toLowerCase(Locale.ROOT);
        String sub = stringValue(claims.get("sub"));
        if (!emailVerified || isBlank(email) || isBlank(sub)) {
            throw new AppException(ErrorCode.LOGIN_FAIL);
        }

        String name = stringValue(claims.get("name"));
        if (isBlank(name)) {
            name = email.substring(0, email.indexOf('@'));
        }
        String picture = stringValue(claims.get("picture"));
        return new GoogleUserInfo(sub, email, name, isBlank(picture) ? null : picture);
    }

    private void assertAudienceAllowed(String aud, String azp) {
        if (isBlank(googleClientId)) {
            return;
        }
        String[] allowedIds = googleClientId.split(",");
        for (String candidate : allowedIds) {
            String trimmed = candidate.trim();
            if (!trimmed.isEmpty() && (trimmed.equals(aud) || trimmed.equals(azp))) {
                return;
            }
        }
        logger.warn("Google OAuth token audience mismatch: aud={} azp={}", aud, azp);
        throw new AppException(ErrorCode.INVALID_TOKEN);
    }

    private String primaryClientId() {
        if (isBlank(googleClientId)) {
            return "";
        }
        return googleClientId.split(",")[0].trim();
    }

    private void cleanupExpiredEntries() {
        Instant now = Instant.now();
        pendingStates.entrySet().removeIf(e -> now.isAfter(e.getValue().expiresAt()));
        pendingHandoffs.entrySet().removeIf(e -> now.isAfter(e.getValue().expiresAt()));
    }

    private String generateRandomToken() {
        byte[] bytes = new byte[24];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private String stringValue(Object raw) {
        return raw == null ? "" : String.valueOf(raw).trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
