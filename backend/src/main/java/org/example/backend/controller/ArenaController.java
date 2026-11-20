package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.ArenaAnswerRequest;
import org.example.backend.dto.request.ArenaCreateRoomRequest;
import org.example.backend.dto.request.ArenaJoinRoomRequest;
import org.example.backend.dto.request.ArenaMatchmakingRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.ArenaLeaderboardResponse;
import org.example.backend.dto.response.ArenaMatchmakingStatusResponse;
import org.example.backend.dto.response.ArenaRoomResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.ArenaService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/users/arena")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
public class ArenaController {

    private final ArenaService arenaService;

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<ArenaRoomResponse>>> listRooms() {
        return ApiResponseUtil.success(arenaService.listRooms(), SuccessCode.ARENA_ROOM_SUCCESS);
    }

    @PostMapping("/rooms")
    public ResponseEntity<ApiResponse<ArenaRoomResponse>> createRoom(
            Authentication authentication,
            @RequestBody(required = false) ArenaCreateRoomRequest request
    ) {
        return ApiResponseUtil.success(
                arenaService.createRoom(authentication.getName(), request),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @GetMapping("/rooms/{roomCode}")
    public ResponseEntity<ApiResponse<ArenaRoomResponse>> getRoom(
            Authentication authentication,
            @PathVariable String roomCode
    ) {
        return ApiResponseUtil.success(
                arenaService.getRoom(authentication.getName(), roomCode),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @PostMapping("/rooms/{roomCode}/join")
    public ResponseEntity<ApiResponse<ArenaRoomResponse>> joinRoom(
            Authentication authentication,
            @PathVariable String roomCode,
            @RequestBody(required = false) ArenaJoinRoomRequest request
    ) {
        return ApiResponseUtil.success(
                arenaService.joinRoom(authentication.getName(), roomCode, request != null ? request.getPassword() : null),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @PostMapping("/rooms/{roomCode}/leave")
    public ResponseEntity<ApiResponse<ArenaRoomResponse>> leaveRoom(
            Authentication authentication,
            @PathVariable String roomCode
    ) {
        return ApiResponseUtil.success(
                arenaService.leaveRoom(authentication.getName(), roomCode),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @PostMapping("/rooms/{roomCode}/answer")
    public ResponseEntity<ApiResponse<ArenaRoomResponse>> submitAnswer(
            Authentication authentication,
            @PathVariable String roomCode,
            @RequestBody ArenaAnswerRequest request
    ) {
        return ApiResponseUtil.success(
                arenaService.submitAnswer(authentication.getName(), roomCode, request),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @PostMapping("/matchmaking/join")
    public ResponseEntity<ApiResponse<ArenaMatchmakingStatusResponse>> joinMatchmaking(
            Authentication authentication,
            @RequestBody(required = false) ArenaMatchmakingRequest request
    ) {
        return ApiResponseUtil.success(
                arenaService.joinMatchmaking(authentication.getName(), request),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @GetMapping("/matchmaking/status")
    public ResponseEntity<ApiResponse<ArenaMatchmakingStatusResponse>> getMatchmakingStatus(
            Authentication authentication
    ) {
        return ApiResponseUtil.success(
                arenaService.getMatchmakingStatus(authentication.getName()),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @PostMapping("/matchmaking/leave")
    public ResponseEntity<ApiResponse<ArenaMatchmakingStatusResponse>> leaveMatchmaking(
            Authentication authentication
    ) {
        return ApiResponseUtil.success(
                arenaService.leaveMatchmaking(authentication.getName()),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<ApiResponse<ArenaLeaderboardResponse>> getLeaderboard(
            Authentication authentication
    ) {
        return ApiResponseUtil.success(
                arenaService.getLeaderboard(authentication.getName()),
                SuccessCode.ARENA_ROOM_SUCCESS
        );
    }

    @MessageMapping("/arena/{roomCode}/answer")
    public void handleWsAnswer(@DestinationVariable String roomCode, @Payload ArenaAnswerRequest request) {
        if (request == null || request.getEmail() == null) return;
        arenaService.submitAnswer(request.getEmail(), roomCode, request);
    }
}
