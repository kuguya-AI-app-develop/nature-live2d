import type { EmotionIntent, MotionPerformanceStyleName } from "./types.js";

export const MOTION_PERFORMANCE_STYLES = [
  "bounce",
  "laugh",
  "soft_sway",
  "peek",
  "squirm",
  "flinch",
  "double_take",
  "tremble",
  "brace",
  "lean_in",
  "side_eye",
  "withdraw",
  "sob",
  "nod",
  "yawn",
  "stern",
  "still",
] as const satisfies readonly MotionPerformanceStyleName[];

const MOTION_STYLE_SET = new Set<string>(MOTION_PERFORMANCE_STYLES);

export function resolveMotionPerformanceStyle(intent: EmotionIntent): MotionPerformanceStyleName | null {
  if (intent.motionStyle && MOTION_STYLE_SET.has(intent.motionStyle)) return intent.motionStyle;

  const presetId = intent.presetId?.toLowerCase() ?? "";
  if (/giddy|bounce|beaming|sparkle|celebrat/.test(presetId)) return "bounce";
  if (/laugh/.test(presetId)) return "laugh";
  if (/peek/.test(presetId)) return "peek";
  if (/squirm|cover_face|steam|flustered_praise/.test(presetId)) return "squirm";
  if (/double_take/.test(presetId)) return "double_take";
  if (/bracing/.test(presetId)) return "brace";
  if (/frozen|blank_stare/.test(presetId)) return "still";
  if (/hypervent|world_spinning|choked|small_shake|alarm/.test(presetId)) return "tremble";
  if (/tiny_gasp|speechless|startled/.test(presetId)) return "flinch";
  if (/sob|silent_tears|tears_welling|crying/.test(presetId)) return "sob";
  if (/head_nod/.test(presetId)) return "nod";
  if (/yawn|mumbling/.test(presetId)) return "yawn";
  if (/side_eye|skeptical|suspicious|deadpan|glare|guarded/.test(presetId)) return "side_eye";
  if (/urgent_focus|determined|focused|cold_guard|eye_twitch/.test(presetId)) return "stern";
  if (/hurt|lonely|small_voice|apologetic|wistful|disappointed/.test(presetId)) return "withdraw";
  if (/reassur|relief|tender|grateful|touched|cozy/.test(presetId)) return "soft_sway";

  switch (intent.tone) {
    case "celebratory":
    case "excited":
    case "delighted":
      return "bounce";
    case "amused":
      return "laugh";
    case "reassuring":
    case "relieved":
    case "grateful":
    case "tender":
      return "soft_sway";
    case "concerned":
      return "lean_in";
    case "bashful":
    case "flustered":
      return "squirm";
    case "startled":
      return "flinch";
    case "nervous":
      return "tremble";
    case "skeptical":
    case "guarded":
      return "side_eye";
    case "focused":
    case "determined":
    case "frustrated":
      return "stern";
    case "apologetic":
    case "disappointed":
    case "wistful":
      return "withdraw";
    default:
      break;
  }
  switch (intent.emotion) {
    case "happy":
      return "soft_sway";
    case "shy":
    case "embarrassed":
      return "squirm";
    case "panic":
      return "tremble";
    case "surprised":
      return "flinch";
    case "confused":
    case "teasing":
      return "side_eye";
    case "sad":
      return "withdraw";
    case "crying":
      return "sob";
    case "sleepy":
      return "nod";
    case "angry":
      return "stern";
    default:
      return null;
  }
}
