/**
 * useAudioPlayer — Consumer hook for the AudioPlayerContext.
 *
 * Import this in UI components to access audio player state and actions.
 * Must be used within an <AudioPlayerProvider>.
 *
 * @example
 * function SurahList() {
 *   const { actions, currentSurah, player } = useAudioPlayer();
 *   // ...
 * }
 */

export {
  useAudioPlayer,
  AudioPlayerProvider,
} from "@/components/providers/AudioProvider";

export type {
  AudioPlayerContextValue,
  AudioPlayerActions,
  AudioPlayerState,
} from "@/components/providers/AudioProvider";
