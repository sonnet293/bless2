// js/rooms.js
export const ROOMS = [
    {
        id: "battleroom1",
        no: 1,
        name: "나하시",
    },
    {
        id: "battleroom2",
        no: 2,
        name: "아담",
    },
    {
        id: "battleroom3",
        no: 3,
        name: "이브",
    },
];

export function roomInfo(roomId) {
    return ROOMS.find((r) => r.id === roomId);
}

export const PLAYER_SLOTS = ["player1", "player2"];

export function roomStatus(room) {
    if (!room) return { key: "closed", label: "닫힘" };
    if (room.battle_winner) return { key: "ended", label: "종료" };
    if (room.game_started) return { key: "playing", label: "배틀 중" };
    return { key: "waiting", label: "대기 중" };
}