package org.example.backend.dto.response;

import lombok.Data;

import java.util.List;

@Data
public class ArenaLeaderboardResponse {
    private int myDiamonds;
    private int myElo;
    private int myWins;
    private int myLosses;
    private int myWinRate;
    private List<LeaderboardEntry> entries;

    @Data
    public static class LeaderboardEntry {
        private int rank;
        private Long userId;
        private String fullName;
        private String username;
        private String avatarUrl;
        private String equippedFrameId;
        private boolean verified;
        private int level;
        private int elo;
        private int wins;
        private int losses;
        private int winRate;
        private int diamonds;
    }
}
