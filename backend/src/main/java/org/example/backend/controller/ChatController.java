package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.ChatFriendActionRequest;
import org.example.backend.dto.request.ChatSendMessageRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.ChatFriendsResponse;
import org.example.backend.dto.response.ChatMessageResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.ChatService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/users/chat")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ChatController {

    private final ChatService chatService;

    @GetMapping("/community")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> getCommunityMessages(
            Authentication authentication,
            @RequestParam(defaultValue = "50") int limit
    ) {
        return ApiResponseUtil.success(
                chatService.getCommunityMessages(authentication.getName(), limit),
                SuccessCode.CHAT_MESSAGES_RETRIEVED
        );
    }

    @PostMapping("/community")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendCommunityMessage(
            Authentication authentication,
            @RequestBody ChatSendMessageRequest request
    ) {
        return ApiResponseUtil.success(
                chatService.sendCommunityMessage(authentication.getName(), request != null ? request.getContent() : null),
                SuccessCode.CHAT_MESSAGE_SENT
        );
    }

    @GetMapping("/friends")
    public ResponseEntity<ApiResponse<ChatFriendsResponse>> getFriends(Authentication authentication) {
        return ApiResponseUtil.success(
                chatService.getFriendsOverview(authentication.getName()),
                SuccessCode.FRIENDSHIP_UPDATED
        );
    }

    @GetMapping("/users/search")
    public ResponseEntity<ApiResponse<List<ChatFriendsResponse.FriendPerson>>> searchUsers(
            Authentication authentication,
            @RequestParam(defaultValue = "") String q
    ) {
        return ApiResponseUtil.success(
                chatService.searchUsers(authentication.getName(), q),
                SuccessCode.FRIENDSHIP_UPDATED
        );
    }

    @PostMapping("/friends/request")
    public ResponseEntity<ApiResponse<ChatFriendsResponse>> sendFriendRequest(
            Authentication authentication,
            @RequestBody ChatFriendActionRequest request
    ) {
        return ApiResponseUtil.success(
                chatService.sendFriendRequest(
                        authentication.getName(),
                        request != null ? request.getTargetUserId() : null,
                        request != null ? request.getUsername() : null
                ),
                SuccessCode.FRIENDSHIP_UPDATED
        );
    }

    @PostMapping("/friends/accept")
    public ResponseEntity<ApiResponse<ChatFriendsResponse>> acceptFriendRequest(
            Authentication authentication,
            @RequestBody ChatFriendActionRequest request
    ) {
        return ApiResponseUtil.success(
                chatService.acceptFriendRequest(authentication.getName(), request != null ? request.getTargetUserId() : null),
                SuccessCode.FRIENDSHIP_UPDATED
        );
    }

    @PostMapping("/friends/remove")
    public ResponseEntity<ApiResponse<ChatFriendsResponse>> removeFriendship(
            Authentication authentication,
            @RequestBody ChatFriendActionRequest request
    ) {
        return ApiResponseUtil.success(
                chatService.removeFriendship(authentication.getName(), request != null ? request.getTargetUserId() : null),
                SuccessCode.FRIENDSHIP_UPDATED
        );
    }

    @PostMapping("/friends/block")
    public ResponseEntity<ApiResponse<ChatFriendsResponse>> blockUser(
            Authentication authentication,
            @RequestBody ChatFriendActionRequest request
    ) {
        return ApiResponseUtil.success(
                chatService.blockUser(authentication.getName(), request != null ? request.getTargetUserId() : null),
                SuccessCode.FRIENDSHIP_UPDATED
        );
    }

    @PostMapping("/friends/unblock")
    public ResponseEntity<ApiResponse<ChatFriendsResponse>> unblockUser(
            Authentication authentication,
            @RequestBody ChatFriendActionRequest request
    ) {
        return ApiResponseUtil.success(
                chatService.unblockUser(authentication.getName(), request != null ? request.getTargetUserId() : null),
                SuccessCode.FRIENDSHIP_UPDATED
        );
    }

    @GetMapping("/direct/{peerUserId}")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> getDirectMessages(
            Authentication authentication,
            @PathVariable Long peerUserId,
            @RequestParam(defaultValue = "50") int limit
    ) {
        return ApiResponseUtil.success(
                chatService.getDirectMessages(authentication.getName(), peerUserId, limit),
                SuccessCode.CHAT_MESSAGES_RETRIEVED
        );
    }

    @PostMapping("/direct/{peerUserId}")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendDirectMessage(
            Authentication authentication,
            @PathVariable Long peerUserId,
            @RequestBody ChatSendMessageRequest request
    ) {
        return ApiResponseUtil.success(
                chatService.sendDirectMessage(authentication.getName(), peerUserId, request != null ? request.getContent() : null),
                SuccessCode.CHAT_MESSAGE_SENT
        );
    }
}
