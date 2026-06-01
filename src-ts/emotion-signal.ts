import type {
  ExpressionResult,
  EmotionIntent,
  EmotionName,
  EmotionToneName,
  FacialPerformanceStyleName,
  MotionPerformanceStyleName,
  SpecialExpressionName,
} from "./types.js";
import { resolveMotionPerformanceStyle } from "./motion-style.js";

export type EmotionSignalSource = "prompt" | "reply" | "final" | "sustain" | "fallback";

export interface EmotionSignalTextInput {
  promptText?: string;
  replyText?: string;
  text?: string;
  timestampMs?: number;
}

export interface EmotionSignal {
  source: EmotionSignalSource;
  intent: EmotionIntent;
  presetId?: string | null;
  presetLabel?: string | null;
  confidence: number;
  matched: string[];
  held: boolean;
  timestampMs: number;
  reason: string;
}

export interface EmotionSignalRule {
  presetId?: string;
  presetLabel?: string;
  presetOnly?: boolean;
  emotion: EmotionName;
  tone?: EmotionToneName | null;
  patterns: Array<string | RegExp>;
  intensity?: number;
  confidence?: number;
  gaze?: string | null;
  head?: string | null;
  eyes?: string | null;
  brows?: string | null;
  mouth?: string | null;
  facialStyle?: FacialPerformanceStyleName | null;
  motionStyle?: MotionPerformanceStyleName | null;
  specialExpression?: SpecialExpressionName | null;
}

export interface KeywordEmotionEstimatorOptions {
  rules?: EmotionSignalRule[];
  baseIntensity?: number;
  promptBias?: number;
  replyBias?: number;
  minIntensity?: number;
  maxIntensity?: number;
  durationMs?: number;
  now?: () => number;
}

export interface EmotionIntentStabilizerOptions {
  holdMs?: number;
  neutralHoldMs?: number;
  switchMargin?: number;
  holdDecay?: number;
  now?: () => number;
}

export interface EmotionIntentBlendOptions {
  amount?: number;
  finalSwitchAt?: number;
  neutralFinalAmount?: number;
  allowNeutralFinal?: boolean;
}

export interface EmotionSustainOptions {
  intensityAmplitude?: number;
  minIntensity?: number;
  maxIntensity?: number;
  durationMs?: number;
  gazeCycle?: Array<string | null>;
  headCycle?: Array<string | null>;
  eyesCycle?: Array<string | null>;
  browsCycle?: Array<string | null>;
  mouthCycle?: Array<string | null>;
  now?: () => number;
}

export interface EmotionIntentTarget {
  pushIntent(intent: EmotionIntent): ExpressionResult;
}

export interface Live2DExpressionOrchestratorOptions {
  target: EmotionIntentTarget;
  estimator?: KeywordEmotionEstimator;
  estimatorOptions?: KeywordEmotionEstimatorOptions;
  stabilizer?: EmotionIntentStabilizer;
  stabilizerOptions?: EmotionIntentStabilizerOptions;
  finalBlend?: number;
}

export interface Live2DExpressionOrchestratorResult {
  signal: EmotionSignal;
  result: ExpressionResult;
}

export const DEFAULT_EMOTION_SIGNAL_PRESETS: EmotionSignalRule[] = [
  {
    presetId: "happy_touched",
    presetLabel: "Touched Gratitude",
    presetOnly: true,
    emotion: "happy",
    tone: "grateful",
    patterns: ["被感动到", "有点被感动", "你这样陪着我", "心里暖暖的", "deeply touched"],
    intensity: 0.74,
    confidence: 0.8,
    facialStyle: "grateful",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
  },
  {
    presetId: "happy_laughing",
    presetLabel: "Open Laugh",
    presetOnly: true,
    emotion: "happy",
    tone: "amused",
    patterns: ["笑出声", "笑到停不下来", "忍不住笑", "哈哈哈笑", "laughing out loud"],
    intensity: 0.84,
    confidence: 0.8,
    facialStyle: "radiant",
    specialExpression: "closed_eye_smile",
    mouth: "smile",
  },
  {
    presetId: "panic_frozen",
    presetLabel: "Frozen Panic",
    presetOnly: true,
    emotion: "panic",
    tone: "startled",
    patterns: ["脑子一片空白", "吓傻", "整个人都僵住", "完全僵住", "frozen in panic"],
    intensity: 0.9,
    confidence: 0.86,
    facialStyle: "frozen",
    head: "lowered",
    eyes: "wide",
    brows: "worried",
    mouth: "funnel",
  },
  {
    presetId: "panic_shaken_relief",
    presetLabel: "Shaken Relief",
    presetOnly: true,
    emotion: "panic",
    tone: "reassuring",
    patterns: ["手还在抖", "还没缓过来", "腿还有点软", "still shaking", "still rattled"],
    intensity: 0.76,
    confidence: 0.8,
    facialStyle: "concerned",
    gaze: "down",
    head: "lowered",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "surprised_speechless",
    presetLabel: "Speechless Surprise",
    presetOnly: true,
    emotion: "surprised",
    tone: "startled",
    patterns: ["愣住", "说不出话", "目瞪口呆", "一时间没反应过来", "speechless"],
    intensity: 0.84,
    confidence: 0.82,
    facialStyle: "frozen",
    eyes: "wide",
    brows: "soft_up",
    mouth: "funnel",
  },
  {
    presetId: "shy_awkward",
    presetLabel: "Awkward Blush",
    presetOnly: true,
    emotion: "shy",
    tone: "bashful",
    patterns: ["耳朵都红", "不知道该说什么", "突然不知道说什么", "awkward blush", "too shy to answer"],
    intensity: 0.72,
    confidence: 0.78,
    facialStyle: "flustered",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    mouth: "pout",
  },
  {
    presetId: "teasing_wry",
    presetLabel: "Wry Teasing",
    presetOnly: true,
    emotion: "teasing",
    tone: "playful",
    patterns: ["被我逮到", "被我抓到", "小样", "就这点本事", "nice try"],
    intensity: 0.72,
    confidence: 0.78,
    facialStyle: "playful_smirk",
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "pucker",
  },
  {
    presetId: "confused_disbelief",
    presetLabel: "Disbelieving Review",
    presetOnly: true,
    emotion: "confused",
    tone: "skeptical",
    patterns: ["你认真的", "我没看错吧", "这是真的吗", "我是不是看错", "are you serious"],
    intensity: 0.74,
    confidence: 0.8,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    eyes: "wide",
    brows: "soft_up",
    mouth: "funnel",
  },
  {
    presetId: "angry_barely_contained",
    presetLabel: "Contained Anger",
    presetOnly: true,
    emotion: "angry",
    tone: "guarded",
    patterns: ["先压住火", "咬牙", "忍住别发火", "真的要忍住", "barely holding back"],
    intensity: 0.8,
    confidence: 0.82,
    facialStyle: "determined",
    gaze: "left",
    head: "lowered",
    eyes: "soft",
    brows: "angry",
    mouth: "pressed",
  },
  {
    presetId: "sad_hurt",
    presetLabel: "Hurt Sadness",
    presetOnly: true,
    emotion: "sad",
    tone: "disappointed",
    patterns: ["有点受伤", "心里真的很难受", "心里很难受", "这句话伤到我", "that hurt"],
    intensity: 0.76,
    confidence: 0.8,
    facialStyle: "hurt",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "crying_overwhelmed",
    presetLabel: "Overwhelmed Tears",
    presetOnly: true,
    emotion: "crying",
    tone: "disappointed",
    patterns: ["忍不住哭", "泪崩", "眼泪完全止不住", "哭得停不下来", "cannot stop crying"],
    intensity: 0.9,
    confidence: 0.86,
    facialStyle: "hurt",
    specialExpression: "tears",
    gaze: "down",
    head: "lowered",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "sleepy_yawn",
    presetLabel: "Sleepy Yawn",
    presetOnly: true,
    emotion: "sleepy",
    tone: "relieved",
    patterns: ["打哈欠", "哈欠", "困得一直", "眼睛都睁不开", "yawning"],
    intensity: 0.66,
    confidence: 0.74,
    facialStyle: "yawning",
    head: "lowered",
    eyes: "sleepy",
  },
  {
    presetId: "happy_sparkle_delight",
    presetLabel: "Sparkling Delight",
    presetOnly: true,
    emotion: "happy",
    tone: "delighted",
    patterns: ["眼睛都亮了", "开心到发光", "开心到爆", "高兴得跳起来", "sparkling delight"],
    intensity: 0.92,
    confidence: 0.86,
    facialStyle: "bright",
    eyes: "wide",
    brows: "soft_up",
    mouth: "open",
    head: "raised",
  },
  {
    presetId: "happy_relief_laugh",
    presetLabel: "Relief Laugh",
    presetOnly: true,
    emotion: "happy",
    tone: "relieved",
    patterns: ["差点哭出来但松口气", "差点哭出来", "松了一大口气", "笑着松口气", "relief laugh"],
    intensity: 0.86,
    confidence: 0.84,
    facialStyle: "relieved",
    specialExpression: "closed_eye_smile",
    eyes: "soft",
    brows: "soft_up",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "happy_proud_tease",
    presetLabel: "Proud Tease",
    presetOnly: true,
    emotion: "happy",
    tone: "proud",
    patterns: ["怎么样我厉害吧", "我厉害吧", "夸我一下", "是不是很强", "proud tease"],
    intensity: 0.82,
    confidence: 0.82,
    facialStyle: "playful_smirk",
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "smile",
  },
  {
    presetId: "panic_hyperventilate",
    presetLabel: "Hyperventilating Panic",
    presetOnly: true,
    emotion: "panic",
    tone: "nervous",
    patterns: ["喘不过气", "呼吸都乱了", "呼吸乱了", "快喘不上来", "hyperventilating"],
    intensity: 0.94,
    confidence: 0.88,
    facialStyle: "shaken",
    eyes: "wide",
    brows: "worried",
    mouth: "open",
    head: "lowered",
  },
  {
    presetId: "panic_blank_stare",
    presetLabel: "Blank Stare Panic",
    presetOnly: true,
    emotion: "panic",
    tone: "startled",
    patterns: ["大脑直接宕机", "大脑宕机", "整个人呆住", "呆住了", "blank stare"],
    intensity: 0.9,
    confidence: 0.86,
    facialStyle: "frozen",
    gaze: "down",
    head: "lowered",
    eyes: "wide",
    brows: "worried",
    mouth: "funnel",
  },
  {
    presetId: "panic_forced_calm",
    presetLabel: "Forced Calm Panic",
    presetOnly: true,
    emotion: "panic",
    tone: "reassuring",
    patterns: ["还在发抖但会慢慢来", "我还在发抖", "努力冷静下来", "慢慢来我可以", "forced calm"],
    intensity: 0.82,
    confidence: 0.84,
    facialStyle: "concerned",
    gaze: "down",
    head: "lowered",
    eyes: "wide",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "surprised_sparkle",
    presetLabel: "Sparkling Surprise",
    presetOnly: true,
    emotion: "surprised",
    tone: "delighted",
    patterns: ["哇眼睛都亮了", "眼睛都亮了", "完全没想到", "惊喜到发光", "surprise sparkle"],
    intensity: 0.9,
    confidence: 0.86,
    facialStyle: "bright",
    eyes: "wide",
    brows: "soft_up",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "confused_deadpan",
    presetLabel: "Deadpan Confusion",
    presetOnly: true,
    emotion: "confused",
    tone: "skeptical",
    patterns: ["啊这", "我沉默了", "沉默一下", "无语住了", "deadpan"],
    intensity: 0.76,
    confidence: 0.84,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    eyes: "soft",
    mouth: "shrug",
  },
  {
    presetId: "shy_cover_face",
    presetLabel: "Cover Face Fluster",
    presetOnly: true,
    emotion: "embarrassed",
    tone: "flustered",
    patterns: ["想捂脸", "脸热到想躲", "想躲起来", "没脸见人", "cover my face"],
    intensity: 0.92,
    confidence: 0.88,
    facialStyle: "flustered",
    specialExpression: "squeezed_eyes",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "pout",
  },
  {
    presetId: "shy_happy_squirm",
    presetLabel: "Happy Shy Squirm",
    presetOnly: true,
    emotion: "shy",
    tone: "grateful",
    patterns: ["开心得不好意思", "开心到不好意思", "又开心又害羞", "整个人都扭起来", "happy squirm"],
    intensity: 0.84,
    confidence: 0.84,
    facialStyle: "flustered",
    gaze: "down_right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "small_smile",
  },
  {
    presetId: "teasing_side_eye",
    presetLabel: "Side Eye Tease",
    presetOnly: true,
    emotion: "teasing",
    tone: "skeptical",
    patterns: ["斜眼看你", "少来这一套", "我可不吃这套", "side eye"],
    intensity: 0.78,
    confidence: 0.84,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    eyes: "soft",
    mouth: "pout",
  },
  {
    presetId: "teasing_tongue_out",
    presetLabel: "Tongue Out Tease",
    presetOnly: true,
    emotion: "teasing",
    tone: "amused",
    patterns: ["略略略", "吐舌", "逗你玩的", "tongue out"],
    intensity: 0.8,
    confidence: 0.84,
    facialStyle: "mischievous",
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "tongue",
  },
  {
    presetId: "confused_side_eye",
    presetLabel: "Suspicious Side Eye",
    presetOnly: true,
    emotion: "confused",
    tone: "skeptical",
    patterns: ["眯眼看着", "眯眼看", "总觉得不对", "越看越不对", "suspicious side eye"],
    intensity: 0.82,
    confidence: 0.86,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    brows: "worried",
    mouth: "pout",
  },
  {
    presetId: "confused_blank_processing",
    presetLabel: "Blank Processing",
    presetOnly: true,
    emotion: "confused",
    tone: "focused",
    patterns: ["脑袋转不过来", "需要加载一下", "我处理一下", "让我缓冲一下", "still processing"],
    intensity: 0.78,
    confidence: 0.84,
    facialStyle: "frozen",
    eyes: "wide",
    brows: "worried",
    mouth: "funnel",
  },
  {
    presetId: "angry_flash",
    presetLabel: "Anger Flash",
    presetOnly: true,
    emotion: "angry",
    tone: "frustrated",
    patterns: ["火一下就上来", "火一下上来", "真的忍不了", "一下就炸了", "anger flash"],
    intensity: 0.9,
    confidence: 0.86,
    facialStyle: "determined",
    gaze: "left",
    head: "raised",
    brows: "angry",
    mouth: "pressed",
  },
  {
    presetId: "angry_silent_glare",
    presetLabel: "Silent Glare",
    presetOnly: true,
    emotion: "angry",
    tone: "guarded",
    patterns: ["冷着脸", "不说话先看", "冷脸", "盯着看", "silent glare"],
    intensity: 0.82,
    confidence: 0.86,
    facialStyle: "determined",
    gaze: "left",
    head: "lowered",
    eyes: "soft",
    brows: "angry",
    mouth: "frown",
  },
  {
    presetId: "sad_quivering_smile",
    presetLabel: "Quivering Smile",
    presetOnly: true,
    emotion: "sad",
    tone: "wistful",
    patterns: ["勉强笑", "强撑着笑", "笑一下其实很难过", "苦笑", "quivering smile"],
    intensity: 0.82,
    confidence: 0.84,
    facialStyle: "hurt",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "sad_tears_welling",
    presetLabel: "Tears Welling",
    presetOnly: true,
    emotion: "sad",
    tone: "disappointed",
    patterns: ["眼眶都红", "眼泪在打转", "快哭出来", "忍着眼泪", "tears welling"],
    intensity: 0.88,
    confidence: 0.86,
    facialStyle: "hurt",
    gaze: "down",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "pout",
  },
  {
    presetId: "crying_sob",
    presetLabel: "Sobbing Cry",
    presetOnly: true,
    emotion: "crying",
    tone: "disappointed",
    patterns: ["开始抽噎", "抽噎", "哭得停不下来", "哭到发抖", "sobbing"],
    intensity: 0.96,
    confidence: 0.9,
    facialStyle: "hurt",
    specialExpression: "tears",
    gaze: "down",
    head: "lowered",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "sleepy_head_nod",
    presetLabel: "Sleepy Head Nod",
    presetOnly: true,
    emotion: "sleepy",
    tone: "tender",
    patterns: ["困得一直点头", "一直点头", "快睡着了", "点头犯困", "nodding off"],
    intensity: 0.74,
    confidence: 0.82,
    facialStyle: "sleepy",
    gaze: "down",
    head: "lowered",
    eyes: "sleepy",
    mouth: "small_smile",
  },
  {
    presetId: "happy_giddy_bounce",
    presetLabel: "Giddy Bounce",
    presetOnly: true,
    emotion: "happy",
    tone: "excited",
    patterns: ["开心到坐不住", "想蹦起来", "坐不住", "giddy bounce"],
    intensity: 0.9,
    confidence: 0.88,
    facialStyle: "radiant",
    eyes: "wide",
    brows: "soft_up",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "happy_soft_laugh",
    presetLabel: "Soft Laugh",
    presetOnly: true,
    emotion: "happy",
    tone: "amused",
    patterns: ["忍不住轻轻笑", "轻轻笑了一下", "真的好可爱", "soft laugh"],
    intensity: 0.78,
    confidence: 0.84,
    facialStyle: "gentle",
    eyes: "soft",
    brows: "soft_up",
    mouth: "smile",
  },
  {
    presetId: "happy_blushing_praise",
    presetLabel: "Blushing Praise",
    presetOnly: true,
    emotion: "happy",
    tone: "grateful",
    patterns: ["被你夸得", "又开心又脸红", "夸得又开心", "blushing praise"],
    intensity: 0.82,
    confidence: 0.86,
    facialStyle: "flustered",
    gaze: "down_right",
    head: "lowered",
    eyes: "soft",
    mouth: "small_smile",
  },
  {
    presetId: "panic_world_spinning",
    presetLabel: "World Spinning",
    presetOnly: true,
    emotion: "panic",
    tone: "nervous",
    patterns: ["世界都在转", "心跳好快", "头晕", "world is spinning"],
    intensity: 0.9,
    confidence: 0.88,
    facialStyle: "frozen",
    eyes: "wide",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "panic_choked_words",
    presetLabel: "Choked Words",
    presetOnly: true,
    emotion: "panic",
    tone: "startled",
    patterns: ["喉咙像卡住", "一句话都说不出来", "说不出话来", "choked words"],
    intensity: 0.86,
    confidence: 0.86,
    facialStyle: "shaken",
    gaze: "down",
    eyes: "wide",
    brows: "worried",
    mouth: "funnel",
  },
  {
    presetId: "panic_urgent_focus",
    presetLabel: "Urgent Focus",
    presetOnly: true,
    emotion: "panic",
    tone: "focused",
    patterns: ["现在立刻处理", "先止血", "别扩散", "urgent focus"],
    intensity: 0.84,
    confidence: 0.86,
    facialStyle: "determined",
    head: "raised",
    eyes: "wide",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "surprised_double_take",
    presetLabel: "Double Take",
    presetOnly: true,
    emotion: "surprised",
    tone: "skeptical",
    patterns: ["二次确认", "真的假的", "再看一眼", "double take"],
    intensity: 0.82,
    confidence: 0.84,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    eyes: "wide",
    mouth: "funnel",
  },
  {
    presetId: "surprised_tiny_gasp",
    presetLabel: "Tiny Gasp",
    presetOnly: true,
    emotion: "surprised",
    tone: "startled",
    patterns: ["倒吸一口气", "太突然了", "小小吓一跳", "tiny gasp"],
    intensity: 0.78,
    confidence: 0.82,
    facialStyle: "shaken",
    eyes: "wide",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "confused_loading",
    presetLabel: "Loading Confusion",
    presetOnly: true,
    emotion: "confused",
    tone: "focused",
    patterns: ["让我想想", "脑袋还在加载", "等一下", "loading confusion"],
    intensity: 0.74,
    confidence: 0.82,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    brows: "worried",
    mouth: "pressed",
  },
  {
    presetId: "confused_suspicious_squint",
    presetLabel: "Suspicious Squint",
    presetOnly: true,
    emotion: "confused",
    tone: "skeptical",
    patterns: ["眯起眼睛", "越看越可疑", "可疑得很", "suspicious squint"],
    intensity: 0.84,
    confidence: 0.88,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    eyes: "soft",
    mouth: "pressed",
  },
  {
    presetId: "sad_small_voice",
    presetLabel: "Small Voice",
    presetOnly: true,
    emotion: "sad",
    tone: "disappointed",
    patterns: ["声音都变小", "说不下去", "声音越来越小", "small voice"],
    intensity: 0.78,
    confidence: 0.84,
    facialStyle: "hurt",
    gaze: "down",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "sad_lonely",
    presetLabel: "Lonely Sadness",
    presetOnly: true,
    emotion: "sad",
    tone: "wistful",
    patterns: ["有点孤单", "没人懂", "突然觉得孤单", "lonely"],
    intensity: 0.8,
    confidence: 0.84,
    facialStyle: "hurt",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "crying_silent_tears",
    presetLabel: "Silent Tears",
    presetOnly: true,
    emotion: "crying",
    tone: "wistful",
    patterns: ["没有出声", "眼泪一直往下掉", "安静地掉眼泪", "silent tears"],
    intensity: 0.9,
    confidence: 0.88,
    facialStyle: "hurt",
    specialExpression: "tears",
    gaze: "down",
    head: "lowered",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "angry_eye_twitch",
    presetLabel: "Eye Twitch",
    presetOnly: true,
    emotion: "angry",
    tone: "frustrated",
    patterns: ["气得眼皮跳", "快忍不住", "眼皮跳", "eye twitch"],
    intensity: 0.88,
    confidence: 0.88,
    facialStyle: "determined",
    gaze: "left",
    eyes: "soft",
    brows: "angry",
    mouth: "pressed",
  },
  {
    presetId: "angry_forced_smile",
    presetLabel: "Angry Forced Smile",
    presetOnly: true,
    emotion: "angry",
    tone: "skeptical",
    patterns: ["气笑了", "太离谱", "笑不出来但想笑", "angry forced smile"],
    intensity: 0.84,
    confidence: 0.86,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    brows: "angry",
    mouth: "small_smile",
  },
  {
    presetId: "embarrassed_steam",
    presetLabel: "Steaming Embarrassment",
    presetOnly: true,
    emotion: "embarrassed",
    tone: "flustered",
    patterns: ["脸烫得冒烟", "别看我了", "脸快烧起来", "steaming embarrassment"],
    intensity: 0.94,
    confidence: 0.9,
    facialStyle: "flustered",
    specialExpression: "tear_drop",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    mouth: "pout",
  },
  {
    presetId: "shy_peek",
    presetLabel: "Shy Peek",
    presetOnly: true,
    emotion: "shy",
    tone: "bashful",
    patterns: ["偷偷看你", "不敢直视", "偷看一眼", "shy peek"],
    intensity: 0.76,
    confidence: 0.82,
    facialStyle: "flustered",
    gaze: "down_right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "small_smile",
  },
  {
    presetId: "teasing_smug_side",
    presetLabel: "Smug Side Eye",
    presetOnly: true,
    emotion: "teasing",
    tone: "proud",
    patterns: ["得意地斜眼", "哼哼我就知道", "得意看你", "smug side eye"],
    intensity: 0.82,
    confidence: 0.86,
    facialStyle: "playful_smirk",
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "smile",
  },
  {
    presetId: "teasing_fake_innocent",
    presetLabel: "Fake Innocent",
    presetOnly: true,
    emotion: "teasing",
    tone: "playful",
    patterns: ["我可什么都不知道", "装无辜", "无辜一下", "fake innocent"],
    intensity: 0.78,
    confidence: 0.84,
    facialStyle: "mischievous",
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "pucker",
  },
  {
    presetId: "sleepy_mumbling",
    presetLabel: "Sleepy Mumbling",
    presetOnly: true,
    emotion: "sleepy",
    tone: "tender",
    patterns: ["说话都含糊", "让我眯一下", "困到说话", "sleepy mumbling"],
    intensity: 0.78,
    confidence: 0.82,
    facialStyle: "sleepy",
    gaze: "down",
    head: "lowered",
    eyes: "sleepy",
    mouth: "funnel",
  },
  {
    presetId: "sleepy_big_yawn",
    presetLabel: "Big Yawn",
    presetOnly: true,
    emotion: "sleepy",
    tone: "relieved",
    patterns: ["大大打了个哈欠", "眼睛都睁不开", "大哈欠", "big yawn"],
    intensity: 0.82,
    confidence: 0.84,
    facialStyle: "yawning",
    head: "lowered",
    eyes: "sleepy",
    mouth: "open",
  },
  {
    presetId: "sad_warm_comfort",
    presetLabel: "Warm Comfort",
    presetOnly: true,
    emotion: "sad",
    tone: "reassuring",
    patterns: ["我在这里陪你", "慢慢说", "没事的我在", "warm comfort"],
    intensity: 0.72,
    confidence: 0.84,
    facialStyle: "gentle",
    gaze: "down",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "happy_nervous_laugh",
    presetLabel: "Nervous Laugh",
    presetOnly: true,
    emotion: "happy",
    tone: "bashful",
    patterns: ["有点紧张", "只能先笑一下", "紧张地笑", "nervous laugh"],
    intensity: 0.76,
    confidence: 0.82,
    facialStyle: "flustered",
    gaze: "down_right",
    eyes: "soft",
    mouth: "small_smile",
  },
  {
    presetId: "panic_small_shake",
    presetLabel: "Small Shake",
    presetOnly: true,
    emotion: "panic",
    tone: "nervous",
    patterns: ["小幅度发抖", "还能继续", "手有点抖", "small shake"],
    intensity: 0.8,
    confidence: 0.84,
    facialStyle: "concerned",
    gaze: "down",
    eyes: "wide",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "surprised_concerned_turn",
    presetLabel: "Concerned Surprise",
    presetOnly: true,
    emotion: "surprised",
    tone: "concerned",
    patterns: ["等等这不太对", "突然有点担心", "这个变化有点吓人", "unexpected and worrying"],
    intensity: 0.82,
    confidence: 0.86,
    facialStyle: "concerned",
    gaze: "up",
    head: "raised",
    eyes: "wide",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "surprised_relief_release",
    presetLabel: "Surprised Relief",
    presetOnly: true,
    emotion: "surprised",
    tone: "relieved",
    patterns: ["居然已经恢复了", "没想到这么快就稳住了", "原来已经没事了", "unexpectedly recovered"],
    intensity: 0.76,
    confidence: 0.84,
    facialStyle: "relieved",
    gaze: "up",
    head: "tilted_right",
    eyes: "soft",
    brows: "soft_up",
    mouth: "smile",
  },
  {
    presetId: "embarrassed_nervous_laugh",
    presetLabel: "Embarrassed Nervous Laugh",
    presetOnly: true,
    emotion: "embarrassed",
    tone: "flustered",
    patterns: ["尴尬地笑", "只能尴尬地笑", "笑得有点尴尬", "awkward nervous laugh"],
    intensity: 0.8,
    confidence: 0.84,
    facialStyle: "flustered",
    gaze: "down_right",
    head: "tilted_right",
    eyes: "soft",
    brows: "worried",
    mouth: "smile",
  },
  {
    presetId: "embarrassed_grateful_blush",
    presetLabel: "Grateful Blush",
    presetOnly: true,
    emotion: "embarrassed",
    tone: "grateful",
    patterns: ["被照顾得有点不好意思", "谢谢你还愿意陪着我", "感动得有点不好意思", "grateful blush"],
    intensity: 0.76,
    confidence: 0.84,
    facialStyle: "grateful",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
  },
  {
    presetId: "shy_apologetic_glance",
    presetLabel: "Apologetic Shy Glance",
    presetOnly: true,
    emotion: "shy",
    tone: "apologetic",
    patterns: ["不好意思让你担心", "抱歉让你等了这么久", "有点不好意思麻烦你", "apologetic shy glance"],
    intensity: 0.72,
    confidence: 0.82,
    facialStyle: "gentle",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "teasing_reassuring_smile",
    presetLabel: "Reassuring Tease",
    presetOnly: true,
    emotion: "teasing",
    tone: "reassuring",
    patterns: ["好啦不逗你了", "开玩笑的别紧张", "不吓你了", "just kidding relax"],
    intensity: 0.7,
    confidence: 0.84,
    facialStyle: "gentle",
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
  },
  {
    presetId: "crying_touched_release",
    presetLabel: "Touched Tears",
    presetOnly: true,
    emotion: "crying",
    tone: "tender",
    patterns: ["感动得眼泪掉下来了", "哭着说谢谢", "眼泪出来了但很开心", "touched to tears"],
    intensity: 0.84,
    confidence: 0.86,
    facialStyle: "grateful",
    specialExpression: "tears",
    gaze: "down",
    head: "lowered",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
  },
  {
    presetId: "confused_cautious_rethink",
    presetLabel: "Cautious Rethink",
    presetOnly: true,
    emotion: "confused",
    tone: "guarded",
    patterns: ["先别下结论", "让我重新想想", "这里可能还有问题", "cautious rethink"],
    intensity: 0.72,
    confidence: 0.82,
    facialStyle: "skeptical",
    gaze: "left",
    head: "tilted_left",
    eyes: "soft",
    brows: "worried",
    mouth: "pressed",
  },
  {
    presetId: "crying_relieved",
    presetLabel: "Relieved Tears",
    emotion: "crying",
    tone: "relieved",
    patterns: ["喜极而泣", "感动哭", "终于没事了眼泪", "眼泪一下出来了", "relief tears"],
    intensity: 0.8,
    confidence: 0.82,
    facialStyle: "relieved",
    specialExpression: "tears",
    brows: "soft_up",
    mouth: "small_smile",
  },
  {
    presetId: "crying_disappointed",
    presetLabel: "Crying Disappointed",
    emotion: "crying",
    tone: "disappointed",
    patterns: ["哭", "眼泪", "泪珠", "tears", "cry"],
    intensity: 0.72,
    confidence: 0.72,
    facialStyle: "hurt",
    specialExpression: "tears",
  },
  {
    presetId: "crying_wistful",
    presetLabel: "Wistful Crying",
    emotion: "crying",
    tone: "wistful",
    patterns: ["想你想到哭", "舍不得哭", "怀念到掉眼泪", "边哭边想", "crying wistful"],
    intensity: 0.84,
    confidence: 0.82,
    facialStyle: "hurt",
    specialExpression: "tears",
    gaze: "down_left",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "shy_bashful",
    presetLabel: "Shy Bashful",
    emotion: "shy",
    tone: "bashful",
    patterns: ["害羞", "脸红", "不好意思", "被夸", "夸奖", "夸我", "可靠", "shy", "compliment"],
    intensity: 0.58,
    confidence: 0.68,
    gaze: "down_right",
    mouth: "small_smile",
  },
  {
    presetId: "happy_beaming",
    presetLabel: "Beaming Celebration",
    emotion: "happy",
    tone: "celebratory",
    patterns: ["开心坏了", "笑得停不下来", "哈哈哈哈", "庆祝一下", "干杯", "大获全胜", "celebrate"],
    intensity: 0.9,
    confidence: 0.82,
    facialStyle: "radiant",
    specialExpression: "closed_eye_smile",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "happy_delighted",
    presetLabel: "Delighted Happiness",
    emotion: "happy",
    tone: "delighted",
    patterns: ["中奖", "抽到了", "礼物到了", "太惊喜了", "意外收获", "lucky draw", "delighted"],
    intensity: 0.84,
    confidence: 0.78,
    facialStyle: "bright",
    eyes: "wide",
    brows: "soft_up",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "happy_excited",
    presetLabel: "Happy Excited",
    emotion: "happy",
    tone: "excited",
    patterns: ["太棒", "成功", "发布成功", "终于", "惊喜", "做到了", "跑通", "赢了", "awesome", "success", "excited"],
    intensity: 0.78,
    confidence: 0.78,
    facialStyle: "radiant",
    eyes: "wide",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "happy_grateful",
    presetLabel: "Happy Grateful",
    emotion: "happy",
    tone: "grateful",
    patterns: ["谢谢", "感谢", "帮大忙", "帮了大忙", "有你", "辛苦你", "多亏", "thank", "grateful"],
    intensity: 0.66,
    confidence: 0.74,
    facialStyle: "grateful",
    eyes: "soft",
    mouth: "smile",
    head: "lowered",
  },
  {
    presetId: "happy_soft_pride",
    presetLabel: "Quiet Proud Smile",
    emotion: "happy",
    tone: "proud",
    patterns: ["稳稳拿下", "一次过", "一次就过", "做得不错", "干得漂亮", "nice work", "nailed it"],
    intensity: 0.72,
    confidence: 0.76,
    facialStyle: "playful_smirk",
    eyes: "soft",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "happy_warm_relief",
    presetLabel: "Warm Relief",
    emotion: "happy",
    tone: "relieved",
    patterns: ["终于收尾", "顺利收尾", "总算结束", "可以放心", "没事就好", "稳下来了", "缓一缓", "all clear", "wrapped up"],
    intensity: 0.72,
    confidence: 0.76,
    facialStyle: "relieved",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
    head: "raised",
  },
  {
    presetId: "happy_gentle_gratitude",
    presetLabel: "Gentle Gratitude",
    emotion: "happy",
    tone: "grateful",
    patterns: ["谢谢你一直陪着", "真的谢谢你", "有你在真好", "多亏你陪我", "thanks for staying", "thank you for being here"],
    intensity: 0.7,
    confidence: 0.78,
    facialStyle: "grateful",
    gaze: "down",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
    head: "lowered",
  },
  {
    presetId: "panic_reassuring",
    presetLabel: "Reassuring Panic",
    emotion: "panic",
    tone: "reassuring",
    patterns: ["别慌", "不要慌", "稳住", "深呼吸", "来得及", "一起处理", "reassure panic"],
    intensity: 0.68,
    confidence: 0.78,
    facialStyle: "concerned",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "sad_reassuring",
    presetLabel: "Sad Reassuring",
    emotion: "sad",
    tone: "reassuring",
    patterns: ["别慌", "不要慌", "别怕", "冷静", "稳住", "深呼吸", "一步步", "陪你", "陪着你", "一起处理", "别太自责", "别自责", "没关系", "不用道歉", "reassure"],
    intensity: 0.58,
    confidence: 0.72,
    facialStyle: "gentle",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "sad_tender",
    presetLabel: "Tender Comfort",
    emotion: "sad",
    tone: "tender",
    patterns: ["别难过我陪你", "抱抱你", "我会陪着你", "慢慢来我在", "soft comfort"],
    intensity: 0.62,
    confidence: 0.74,
    facialStyle: "gentle",
    gaze: "down",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
    head: "lowered",
  },
  {
    presetId: "angry_focused",
    presetLabel: "Focused Resolve",
    emotion: "angry",
    tone: "focused",
    patterns: ["定位", "排查", "日志", "回滚", "修复", "先看", "处理方案", "开始处理", "debug", "diagnose", "focus"],
    intensity: 0.64,
    confidence: 0.74,
    facialStyle: "determined",
    brows: "angry",
    mouth: "pressed",
    head: "raised",
  },
  {
    presetId: "panic_startled",
    presetLabel: "Startled Panic",
    emotion: "panic",
    tone: "startled",
    patterns: [
      "吓死",
      "后怕",
      "差点炸",
      "刚才好险",
      "太突然了",
      /心跳.*(?:快|加速|嗓子眼|砰砰|厉害)/,
      /(?:快|加速).*心跳/,
      "terrified",
      "scared me badly",
      /heart.*(?:racing|pounding|beating fast)/,
      /(?:racing|pounding).*heart/,
    ],
    intensity: 0.82,
    confidence: 0.78,
    facialStyle: "shaken",
    gaze: "right",
    head: "tilted_right",
    eyes: "wide",
    mouth: "funnel",
  },
  {
    presetId: "panic_bracing",
    presetLabel: "Bracing Panic",
    emotion: "panic",
    tone: "startled",
    patterns: ["不敢看", "闭眼", "捂眼", "要炸了", "吓得闭眼", "brace", "squeeze eyes"],
    intensity: 0.86,
    confidence: 0.82,
    facialStyle: "bracing",
    specialExpression: "squeezed_eyes",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "panic_nervous",
    presetLabel: "Panic Nervous",
    emotion: "panic",
    tone: "nervous",
    patterns: ["糟了", "慌", "紧急", "生产", "线上", "报错", "宕机", "事故", "urgent", "panic"],
    intensity: 0.74,
    confidence: 0.72,
    facialStyle: "shaken",
  },
  {
    presetId: "panic_focused",
    presetLabel: "Focused Incident",
    emotion: "panic",
    tone: "focused",
    patterns: ["事故复盘", "先止血", "紧急排查", "先恢复", "应急处理", "incident response"],
    intensity: 0.7,
    confidence: 0.74,
    facialStyle: "determined",
    eyes: "wide",
    brows: "worried",
    mouth: "pressed",
  },
  {
    presetId: "panic_determined",
    presetLabel: "Determined Incident",
    emotion: "panic",
    tone: "determined",
    patterns: ["我来处理", "马上止血", "我来扛", "现在就修", "立刻恢复", "take over incident"],
    intensity: 0.78,
    confidence: 0.78,
    facialStyle: "determined",
    eyes: "wide",
    brows: "angry",
    mouth: "pressed",
    head: "raised",
  },
  {
    presetId: "panic_alarm",
    presetLabel: "Alarm Spike",
    emotion: "panic",
    tone: "startled",
    patterns: ["告警炸了", "突然报警", "报警了", "全线告警", "警报", "alarm spike", "alerts everywhere"],
    intensity: 0.88,
    confidence: 0.84,
    facialStyle: "shaken",
    gaze: "right",
    head: "tilted_right",
    eyes: "wide",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "panic_recovery",
    presetLabel: "Incident Recovery",
    emotion: "panic",
    tone: "reassuring",
    patterns: [
      "先别急已经稳住",
      "已经稳住先别急",
      "恢复中别慌",
      "先喘口气再看",
      "不急了",
      "已经稳定",
      /慢慢来.*不急/,
      "recovery in progress",
      "stabilized for now",
      "stable now",
      "slow down",
      "take a breath",
    ],
    intensity: 0.7,
    confidence: 0.8,
    facialStyle: "relieved",
    gaze: "down",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "happy_relieved",
    presetLabel: "Relieved Happiness",
    emotion: "happy",
    tone: "relieved",
    patterns: ["松了一口气", "松口气", "放心了", "恢复了", "稳住了", "安全了", "relieved"],
    intensity: 0.68,
    confidence: 0.72,
    facialStyle: "relieved",
    eyes: "soft",
    mouth: "smile",
    head: "raised",
  },
  {
    presetId: "surprised_startled",
    presetLabel: "Startled Surprise",
    emotion: "surprised",
    tone: "startled",
    patterns: ["突然", "吓", "一惊", "刚刚发生", "瞬间", "猝不及防", "startled"],
    intensity: 0.76,
    confidence: 0.7,
    facialStyle: "shaken",
    eyes: "wide",
    mouth: "open",
  },
  {
    presetId: "surprised_guarded",
    presetLabel: "Guarded Surprise",
    emotion: "surprised",
    tone: "guarded",
    patterns: ["突然可疑", "有点可疑", "先别信这个突然", "这惊喜不对劲", "suspicious surprise"],
    intensity: 0.76,
    confidence: 0.78,
    facialStyle: "skeptical",
    gaze: "left",
    eyes: "wide",
    brows: "angry",
    mouth: "pressed",
  },
  {
    presetId: "surprised_excited",
    presetLabel: "Excited Surprise",
    emotion: "surprised",
    tone: "excited",
    patterns: ["太强了", "好厉害", "居然真的", "突然成功", "意外成功", "惊喜成功"],
    intensity: 0.78,
    confidence: 0.74,
    facialStyle: "bright",
    eyes: "wide",
    mouth: "open",
    head: "raised",
  },
  {
    presetId: "surprised_delighted",
    presetLabel: "Delighted Surprise",
    emotion: "surprised",
    tone: "delighted",
    patterns: ["哇", "居然", "没想到", "一次跑通", "一次就跑通", "惊", "surprise", "unexpected"],
    intensity: 0.66,
    confidence: 0.7,
    facialStyle: "bright",
    eyes: "wide",
    mouth: "open",
  },
  {
    presetId: "surprised_positive_news",
    presetLabel: "Bright Surprise",
    emotion: "surprised",
    tone: "delighted",
    patterns: ["真的？太好了", "真的吗太好了", "居然成了", "竟然成功", "突然有好消息", "really that is great", "unexpected good news"],
    intensity: 0.84,
    confidence: 0.8,
    facialStyle: "bright",
    eyes: "wide",
    brows: "soft_up",
    mouth: "open",
    head: "raised",
  },
  {
    presetId: "shy_grateful",
    presetLabel: "Shy Gratitude",
    emotion: "shy",
    tone: "grateful",
    patterns: ["被你帮到", "多亏你", "谢谢你夸", "又害羞又开心", "不好意思但很开心"],
    intensity: 0.68,
    confidence: 0.72,
    facialStyle: "grateful",
    gaze: "down_right",
    mouth: "small_smile",
  },
  {
    presetId: "shy_tender",
    presetLabel: "Tender Shyness",
    emotion: "shy",
    tone: "tender",
    patterns: ["心里暖暖", "你这样说我会害羞", "有你真好", "温柔得不好意思", "warm and shy"],
    intensity: 0.66,
    confidence: 0.72,
    facialStyle: "gentle",
    gaze: "down_right",
    eyes: "soft",
    mouth: "small_smile",
  },
  {
    presetId: "shy_playful",
    presetLabel: "Playful Shyness",
    emotion: "shy",
    tone: "playful",
    patterns: ["别逗我", "你又逗我", "别这样啦", "坏心眼", "playfully shy"],
    intensity: 0.72,
    confidence: 0.76,
    facialStyle: "playful_smirk",
    gaze: "down_right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "smile",
  },
  {
    presetId: "shy_flustered_praise",
    presetLabel: "Flustered Praise",
    emotion: "shy",
    tone: "flustered",
    patterns: ["别再夸了", "夸得我脸红", "夸得我脸都红了", "再夸要害羞死了", "too much praise", "stop praising me"],
    intensity: 0.78,
    confidence: 0.8,
    facialStyle: "flustered",
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "pout",
  },
  {
    presetId: "embarrassed_tear_drop",
    presetLabel: "Flustered Tear Drop",
    emotion: "embarrassed",
    tone: "flustered",
    patterns: ["尴尬死了", "社死", "脸红到爆", "羞死了", "想找个地缝", "extremely embarrassed"],
    intensity: 0.86,
    confidence: 0.84,
    facialStyle: "flustered",
    specialExpression: "tear_drop",
    gaze: "down_left",
    mouth: "pout",
  },
  {
    presetId: "embarrassed_apologetic",
    presetLabel: "Apologetic Embarrassment",
    emotion: "embarrassed",
    tone: "apologetic",
    patterns: ["不好意思我搞砸了", "尴尬抱歉", "对不起有点尴尬", "丢脸还添麻烦", "embarrassed apology"],
    intensity: 0.76,
    confidence: 0.78,
    facialStyle: "hurt",
    gaze: "down_left",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "embarrassed_bashful",
    presetLabel: "Embarrassed Bashful",
    emotion: "embarrassed",
    tone: "flustered",
    patterns: ["尴尬", "脸烫", "脸红到", "不好意思到", "embarrassed"],
    intensity: 0.72,
    confidence: 0.72,
    facialStyle: "flustered",
    gaze: "down_left",
    mouth: "small_smile",
  },
  {
    presetId: "teasing_playful",
    presetLabel: "Playful Teasing",
    emotion: "teasing",
    tone: "playful",
    patterns: ["逗", "哼哼", "破绽", "调皮", "teasing", "smirk"],
    intensity: 0.56,
    confidence: 0.62,
  },
  {
    presetId: "teasing_amused",
    presetLabel: "Amused Teasing",
    emotion: "teasing",
    tone: "amused",
    patterns: ["哈哈", "好笑", "笑死", "被你逗笑", "原来如此", "amused", "funny"],
    intensity: 0.66,
    confidence: 0.68,
    eyes: "soft",
    mouth: "smile",
  },
  {
    presetId: "teasing_bashful",
    presetLabel: "Bashful Teasing",
    emotion: "teasing",
    tone: "bashful",
    patterns: ["被你反撩", "这下轮到我害羞", "被你逗害羞", "反而脸红了", "playful blush"],
    intensity: 0.64,
    confidence: 0.74,
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "smile",
  },
  {
    presetId: "teasing_smug",
    presetLabel: "Smug Teasing",
    emotion: "teasing",
    tone: "playful",
    patterns: ["我就知道", "看吧我猜对了", "被我猜中", "果然被我说中", "told you", "called it"],
    intensity: 0.7,
    confidence: 0.76,
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "smile",
  },
  {
    presetId: "teasing_mischief",
    presetLabel: "Mischievous Teasing",
    emotion: "teasing",
    tone: "amused",
    patterns: ["故意逗你", "就是想逗你", "被我骗到了吧", "开个小玩笑", "just teasing", "got you"],
    intensity: 0.74,
    confidence: 0.78,
    gaze: "right",
    head: "tilted_right",
    eyes: "soft",
    mouth: "tongue",
  },
  {
    presetId: "confused_amused",
    presetLabel: "Amused Confusion",
    emotion: "confused",
    tone: "amused",
    patterns: ["离谱到好笑", "这也太离谱", "被整笑了", "好怪但好笑", "what is this lol"],
    intensity: 0.68,
    confidence: 0.76,
    eyes: "soft",
    mouth: "smile",
    head: "tilted_left",
  },
  {
    presetId: "confused_skeptical",
    presetLabel: "Skeptical Confusion",
    emotion: "confused",
    tone: "skeptical",
    patterns: [
      "嗯？",
      "嗯?",
      "是不是",
      "不太对",
      "不对劲",
      "哪里不对",
      "真的吗",
      "确定吗",
      "可疑",
      "有疑点",
      "奇怪",
      "怪怪",
      "不放心",
      "不太放心",
      "suspicious",
      "strange",
      "doubt",
      /指标.*(?:奇怪|异常|不对|可疑)/,
      /metric.*(?:suspicious|strange|wrong|odd)/,
      "skeptical",
    ],
    intensity: 0.68,
    confidence: 0.74,
    brows: "worried",
    mouth: "pout",
    head: "tilted_left",
  },
  {
    presetId: "confused_concerned",
    presetLabel: "Concerned Confusion",
    emotion: "confused",
    tone: "concerned",
    patterns: ["困惑", "疑惑", "不明白", "疑问", "不安", "不安心", "不放心", "uneasy", "concerned", /指标.*(?:疑问|不安|不安心|奇怪|异常)/, "confused"],
    intensity: 0.68,
    confidence: 0.68,
  },
  {
    presetId: "confused_startled",
    presetLabel: "Startled Confusion",
    emotion: "confused",
    tone: "startled",
    patterns: ["等等怎么回事", "发生什么了", "怎么突然", "这是什么情况", "what happened"],
    intensity: 0.7,
    confidence: 0.74,
    eyes: "wide",
    brows: "worried",
    mouth: "open",
  },
  {
    presetId: "confused_focused",
    presetLabel: "Focused Confusion",
    emotion: "confused",
    tone: "focused",
    patterns: ["先理一下", "重新梳理", "看起来像", "我需要确认", "复盘一下", "trace"],
    intensity: 0.62,
    confidence: 0.68,
    brows: "worried",
    mouth: "pressed",
  },
  {
    presetId: "confused_reassuring",
    presetLabel: "Reassuring Analysis",
    emotion: "confused",
    tone: "reassuring",
    patterns: ["别急我帮你梳理", "我们慢慢理", "先慢慢确认", "我来帮你理清楚", "reassuring analysis"],
    intensity: 0.6,
    confidence: 0.72,
    gaze: "down",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "confused_metric_skeptical",
    presetLabel: "Metric Skepticism",
    emotion: "confused",
    tone: "skeptical",
    patterns: ["指标不对", "指标异常", "数据对不上", "数据可疑", "数字不合理", "metrics do not add up", "suspicious metric"],
    intensity: 0.74,
    confidence: 0.82,
    gaze: "left",
    head: "tilted_left",
    eyes: "soft",
    brows: "worried",
    mouth: "pout",
  },
  {
    presetId: "confused_careful_review",
    presetLabel: "Careful Review",
    emotion: "confused",
    tone: "focused",
    patterns: ["让我再确认", "我想确认一下", "再仔细看看", "逐项核对", "重新检查一遍", "let me verify", "double check"],
    intensity: 0.68,
    confidence: 0.76,
    gaze: "left",
    head: "tilted_left",
    eyes: "wide",
    brows: "worried",
    mouth: "pressed",
  },
  {
    presetId: "angry_determined",
    presetLabel: "Determined Anger",
    emotion: "angry",
    tone: "determined",
    patterns: ["生气", "愤怒", "不满", "angry"],
    intensity: 0.62,
    confidence: 0.62,
  },
  {
    presetId: "angry_guarded",
    presetLabel: "Guarded Anger",
    emotion: "angry",
    tone: "guarded",
    patterns: ["警惕", "戒备", "别急着相信", "小心有诈", "防着", "guarded"],
    intensity: 0.66,
    confidence: 0.76,
    facialStyle: "determined",
    gaze: "left",
    brows: "angry",
    mouth: "pressed",
  },
  {
    presetId: "angry_skeptical",
    presetLabel: "Skeptical Anger",
    emotion: "angry",
    tone: "skeptical",
    patterns: [
      "明显不对劲",
      "不能信",
      "我不相信",
      "不相信",
      "不敢相信",
      "不敢完全相信",
      "不能完全相信",
      "这说法不对",
      "do not trust",
      "don't trust",
      "not trust",
      "cannot trust",
      "angry skeptical",
    ],
    intensity: 0.74,
    confidence: 0.8,
    facialStyle: "skeptical",
    gaze: "left",
    brows: "angry",
    mouth: "pressed",
    head: "tilted_left",
  },
  {
    presetId: "angry_frustrated",
    presetLabel: "Frustrated Anger",
    emotion: "angry",
    tone: "frustrated",
    patterns: ["烦", "崩溃", "卡住", "怎么又", "受不了", "糟糕透", "frustrated"],
    intensity: 0.72,
    confidence: 0.72,
    brows: "angry",
    mouth: "pressed",
  },
  {
    presetId: "angry_exasperated_retry",
    presetLabel: "Exasperated Retry",
    emotion: "angry",
    tone: "frustrated",
    patterns: ["怎么又出问题", "又卡住了", "一遍又一遍", "反复失败", "又来了", "not again", "keeps failing"],
    intensity: 0.8,
    confidence: 0.82,
    gaze: "left",
    head: "tilted_left",
    brows: "angry",
    mouth: "pressed",
  },
  {
    presetId: "angry_cold_guarded",
    presetLabel: "Cold Guard",
    emotion: "angry",
    tone: "guarded",
    patterns: ["先别信他", "保持警惕", "别被骗", "有诈", "不要轻信", "stay alert", "do not fall for it"],
    intensity: 0.74,
    confidence: 0.8,
    facialStyle: "determined",
    gaze: "left",
    head: "tilted_left",
    eyes: "soft",
    brows: "angry",
    mouth: "pout",
  },
  {
    presetId: "crying_apologetic",
    presetLabel: "Apologetic Crying",
    emotion: "crying",
    tone: "apologetic",
    patterns: ["哭着道歉", "对不起我哭", "真的抱歉", "眼泪止不住", "哭出来了"],
    intensity: 0.82,
    confidence: 0.8,
    specialExpression: "tears",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "sad_apologetic",
    presetLabel: "Apologetic Sadness",
    emotion: "sad",
    tone: "apologetic",
    patterns: ["对不起", "抱歉", "是我不好", "我错了", "添麻烦", "apologetic"],
    intensity: 0.62,
    confidence: 0.72,
    brows: "worried",
    mouth: "small_smile",
    head: "lowered",
  },
  {
    presetId: "sad_concerned",
    presetLabel: "Concerned Sadness",
    emotion: "sad",
    tone: "concerned",
    patterns: ["担心", "不安", "放心不下", "心里发沉", "有点怕", "concerned"],
    intensity: 0.64,
    confidence: 0.7,
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "sad_wistful",
    presetLabel: "Wistful Sadness",
    emotion: "sad",
    tone: "wistful",
    patterns: ["舍不得", "遗憾", "可惜", "想念", "怀念", "wistful"],
    intensity: 0.62,
    confidence: 0.72,
    gaze: "down_left",
    eyes: "soft",
    mouth: "frown",
  },
  {
    presetId: "sad_disappointed",
    presetLabel: "Disappointed Sadness",
    emotion: "sad",
    tone: "disappointed",
    patterns: ["难过", "失败", "白忙", "累", "太辛苦", "很辛苦", "辛苦得", "辛苦到", "苛责", "对不起", "抱歉", "sad", "sorry"],
    intensity: 0.6,
    confidence: 0.64,
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "sad_gentle_reassurance",
    presetLabel: "Gentle Reassurance",
    emotion: "sad",
    tone: "reassuring",
    patterns: ["没关系我在", "不要一个人扛", "慢慢来我陪你", "你不用逞强", "i am here with you", "you are not alone"],
    intensity: 0.7,
    confidence: 0.8,
    gaze: "down",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "small_smile",
  },
  {
    presetId: "sad_heavy_concern",
    presetLabel: "Heavy Concern",
    emotion: "sad",
    tone: "concerned",
    patterns: ["心里不踏实", "越想越担心", "放心不下来", "总觉得会出事", "deeply worried", "cannot shake the worry"],
    intensity: 0.76,
    confidence: 0.8,
    gaze: "down_left",
    head: "lowered",
    eyes: "soft",
    brows: "worried",
    mouth: "frown",
  },
  {
    presetId: "happy_playful",
    presetLabel: "Playful Happiness",
    emotion: "happy",
    tone: "playful",
    patterns: ["嘿嘿", "有点得意", "偷笑", "小开心", "开心到想逗你"],
    intensity: 0.68,
    confidence: 0.66,
    mouth: "smile",
    head: "tilted_right",
  },
  {
    presetId: "happy_proud",
    presetLabel: "Proud Happiness",
    emotion: "happy",
    tone: "proud",
    patterns: ["开心", "高兴", "笑", "顺利", "厉害", "爽", "happy", "smile"],
    intensity: 0.62,
    confidence: 0.58,
    facialStyle: "playful_smirk",
    mouth: "smile",
  },
  {
    presetId: "happy_tender",
    presetLabel: "Tender Happiness",
    emotion: "happy",
    tone: "tender",
    patterns: ["很温暖", "好温柔", "陪着你", "抱抱", "安心陪你", "tender"],
    intensity: 0.6,
    confidence: 0.68,
    facialStyle: "gentle",
    eyes: "soft",
    brows: "soft_up",
    mouth: "small_smile",
  },
  {
    presetId: "sleepy_relieved",
    presetLabel: "Relieved Sleepiness",
    emotion: "sleepy",
    tone: "relieved",
    patterns: ["终于能休息", "可以睡了", "睡一会", "休息了", "累坏了终于结束", "先休息一下", "rest at last"],
    intensity: 0.58,
    confidence: 0.68,
    facialStyle: "sleepy",
    eyes: "sleepy",
    head: "lowered",
  },
  {
    presetId: "sleepy_grateful",
    presetLabel: "Sleepy Gratitude",
    emotion: "sleepy",
    tone: "grateful",
    patterns: ["谢谢你让我休息", "辛苦了我先睡", "安心睡了", "睡前谢谢", "sleepy thanks"],
    intensity: 0.56,
    confidence: 0.68,
    facialStyle: "grateful",
    eyes: "sleepy",
    mouth: "small_smile",
    head: "lowered",
  },
  {
    presetId: "sleepy_cozy",
    presetLabel: "Cozy Sleepiness",
    emotion: "sleepy",
    tone: "tender",
    patterns: [
      "困困的但很安心",
      "安心睡吧",
      "晚安陪着你",
      "好困好安心",
      "cozy sleepy",
      "sleep well",
      /困.*安心/,
      /安心.*睡/,
      /晚安.*陪/,
    ],
    intensity: 0.58,
    confidence: 0.72,
    facialStyle: "gentle",
    gaze: "down",
    head: "lowered",
    eyes: "sleepy",
    mouth: "small_smile",
  },
  {
    presetId: "sleepy_soft",
    presetLabel: "Sleepy Soft",
    emotion: "sleepy",
    patterns: ["困", "睡", "sleepy"],
    intensity: 0.52,
    confidence: 0.55,
    facialStyle: "sleepy",
    eyes: "sleepy",
  },
];

const DEFAULT_RULES: EmotionSignalRule[] = DEFAULT_EMOTION_SIGNAL_PRESETS;

const DEFAULT_SUSTAIN_CYCLES: Record<EmotionName, Omit<EmotionSustainOptions, "now" | "durationMs" | "intensityAmplitude">> = {
  neutral: {
    eyesCycle: [null, "soft", null],
    headCycle: [null, "tilted_left", null, "tilted_right"],
    mouthCycle: [null],
  },
  happy: {
    eyesCycle: ["soft", null, "soft"],
    headCycle: [null, "tilted_left", null, "tilted_right"],
    mouthCycle: ["small_smile", "smile", "small_smile"],
  },
  shy: {
    gazeCycle: ["down_right", "down_left", "down_right"],
    headCycle: ["lowered", "tilted_right", "lowered", "tilted_left"],
    eyesCycle: ["soft", "soft", null],
    mouthCycle: ["small_smile", "small_smile", "smile"],
  },
  embarrassed: {
    gazeCycle: ["down_left", "down_right", "down_left"],
    headCycle: ["lowered", "tilted_left", "lowered", "tilted_right"],
    eyesCycle: ["soft", null, "soft"],
    mouthCycle: ["small_smile", null, "small_smile"],
  },
  angry: {
    gazeCycle: [null, "left", null, "right"],
    browsCycle: ["angry"],
    mouthCycle: ["frown", null],
  },
  sad: {
    gazeCycle: ["down", "down_left", "down"],
    headCycle: ["lowered", null, "lowered"],
    eyesCycle: ["soft", null],
    browsCycle: ["worried"],
    mouthCycle: ["frown"],
  },
  crying: {
    gazeCycle: ["down", "down_left", "down_right"],
    headCycle: ["lowered", null, "lowered"],
    eyesCycle: ["soft"],
    browsCycle: ["worried"],
    mouthCycle: ["frown"],
  },
  surprised: {
    gazeCycle: [null, "left", null, "right"],
    eyesCycle: ["wide", null, "wide"],
    mouthCycle: ["open", null, "open"],
  },
  confused: {
    gazeCycle: ["left", null, "right", null],
    headCycle: ["tilted_left", null, "tilted_right", null],
    browsCycle: ["worried", null],
    mouthCycle: ["pout", null],
  },
  teasing: {
    gazeCycle: ["right", null, "left", null],
    headCycle: ["tilted_right", null, "tilted_left", null],
    eyesCycle: ["soft", null],
    mouthCycle: ["small_smile", "smile", "small_smile"],
  },
  sleepy: {
    headCycle: ["lowered", null, "lowered"],
    eyesCycle: ["sleepy", "soft", "sleepy"],
    mouthCycle: [null],
  },
  panic: {
    gazeCycle: ["left", "right", null],
    eyesCycle: ["wide", null, "wide"],
    browsCycle: ["worried", null],
    mouthCycle: ["open", null],
  },
};

export class KeywordEmotionEstimator {
  private readonly rules: EmotionSignalRule[];
  private readonly baseIntensity: number;
  private readonly promptBias: number;
  private readonly replyBias: number;
  private readonly minIntensity: number;
  private readonly maxIntensity: number;
  private readonly durationMs: number;
  private readonly now: () => number;

  constructor(options: KeywordEmotionEstimatorOptions = {}) {
    this.rules = options.rules ?? DEFAULT_RULES;
    this.baseIntensity = clamp(options.baseIntensity ?? 0.75, 0, 1);
    this.promptBias = clamp(options.promptBias ?? 0.28, 0, 1);
    this.replyBias = clamp(options.replyBias ?? 0.38, 0, 1);
    this.minIntensity = clamp(options.minIntensity ?? 0.12, 0, 1);
    this.maxIntensity = clamp(options.maxIntensity ?? 0.82, 0, 1);
    this.durationMs = Math.max(1, Math.round(options.durationMs ?? 1200));
    this.now = options.now ?? defaultNow;
  }

  estimate(input: EmotionSignalTextInput | string): EmotionSignal {
    const normalized = typeof input === "string" ? { text: input } : input;
    const replyText = normalized.replyText ?? "";
    const promptText = normalized.promptText ?? normalized.text ?? "";
    const reply = selectReplyMatch(replyText, this.rules);
    const replyMatch = reply.match;
    const promptMatch = matchRules(promptText, this.rules);
    const useReply = Boolean(replyText.trim()) && replyMatch.intent.emotion !== "neutral";
    const source: EmotionSignalSource = useReply
      ? "reply"
      : promptMatch.intent.emotion !== "neutral"
        ? "prompt"
        : "fallback";
    const match = source === "reply" ? replyMatch : source === "prompt" ? promptMatch : null;
    const text = source === "reply" ? reply.text : promptText;
    const visibleLength = text.replace(/\s+/g, "").length;
    const lengthConfidence = Math.min(0.22, visibleLength / 260);
    const sourceBias = source === "reply" ? this.replyBias : source === "prompt" ? this.promptBias : 0.18;
    const confidence = clamp((match?.confidence ?? 0.18) + sourceBias + lengthConfidence, 0.08, 1);
    const matched = match?.matched ?? [];
    const intent = {
      ...(match?.intent ?? { emotion: "neutral" as const }),
      intensity: clamp((match?.intent.intensity ?? 0.45) * confidence * (this.baseIntensity / 0.75), this.minIntensity, this.maxIntensity),
      durationMs: this.durationMs,
    };
    const preset = resolveEmotionSignalPreset(intent);
    const resolvedIntent = withResolvedMotionStyle({
      ...intent,
      presetId: intent.presetId ?? preset?.presetId ?? null,
      presetLabel: intent.presetLabel ?? preset?.presetLabel ?? null,
    });
    return {
      source,
      intent: resolvedIntent,
      presetId: resolvedIntent.presetId ?? null,
      presetLabel: resolvedIntent.presetLabel ?? null,
      confidence,
      matched,
      held: false,
      timestampMs: normalized.timestampMs ?? this.now(),
      reason: matched.length ? matched.join(", ") : "no emotion keyword matched",
    };
  }
}

export class EmotionIntentStabilizer {
  private readonly holdMs: number;
  private readonly neutralHoldMs: number;
  private readonly switchMargin: number;
  private readonly holdDecay: number;
  private readonly now: () => number;
  private current: EmotionSignal | null = null;
  private changedAt = 0;

  constructor(options: EmotionIntentStabilizerOptions = {}) {
    this.holdMs = Math.max(0, options.holdMs ?? 520);
    this.neutralHoldMs = Math.max(0, options.neutralHoldMs ?? 900);
    this.switchMargin = Math.max(0, options.switchMargin ?? 0.12);
    this.holdDecay = clamp(options.holdDecay ?? 0.94, 0, 1);
    this.now = options.now ?? defaultNow;
  }

  reset(): void {
    this.current = null;
    this.changedAt = 0;
  }

  push(signal: EmotionSignal | EmotionIntent): EmotionSignal {
    const next = isEmotionSignal(signal) ? signal : createSignalFromIntent(signal, this.now());
    if (!this.current) {
      this.current = next;
      this.changedAt = next.timestampMs;
      return next;
    }

    const heldForMs = next.timestampMs - this.changedAt;
    const currentEmotion = this.current.intent.emotion;
    const nextEmotion = next.intent.emotion;
    if (currentEmotion === nextEmotion) {
      this.current = next;
      return next;
    }

    const shouldHoldNeutral = currentEmotion !== "neutral"
      && nextEmotion === "neutral"
      && heldForMs < this.neutralHoldMs;
    const compatibleSwitch = signalEmotionsCompatible(currentEmotion, nextEmotion);
    const shouldHoldSwitch = currentEmotion !== "neutral"
      && nextEmotion !== "neutral"
      && !compatibleSwitch
      && heldForMs < this.holdMs
      && next.confidence < this.current.confidence + this.switchMargin;
    if (shouldHoldNeutral || shouldHoldSwitch) {
      const held = {
        ...this.current,
        held: true,
        timestampMs: next.timestampMs,
        intent: {
          ...this.current.intent,
          intensity: clamp((this.current.intent.intensity ?? 0.45) * this.holdDecay, 0.08, 1),
        },
        reason: `held ${currentEmotion} over ${nextEmotion}`,
      };
      this.current = held;
      return held;
    }

    this.current = next;
    this.changedAt = next.timestampMs;
    return next;
  }
}

export class Live2DExpressionOrchestrator {
  private readonly target: EmotionIntentTarget;
  private readonly estimator: KeywordEmotionEstimator;
  private readonly stabilizer: EmotionIntentStabilizer;
  private readonly finalBlend: number;
  private lastNonSustainSignal: EmotionSignal | null = null;
  private sustainStep = 0;
  lastSignal: EmotionSignal | null = null;
  lastResult: ExpressionResult | null = null;

  constructor(options: Live2DExpressionOrchestratorOptions) {
    this.target = options.target;
    this.estimator = options.estimator ?? new KeywordEmotionEstimator(options.estimatorOptions);
    this.stabilizer = options.stabilizer ?? new EmotionIntentStabilizer(options.stabilizerOptions);
    this.finalBlend = clamp(options.finalBlend ?? 0.55, 0, 1);
  }

  reset(): void {
    this.stabilizer.reset();
    this.lastNonSustainSignal = null;
    this.sustainStep = 0;
    this.lastSignal = null;
    this.lastResult = null;
  }

  pushStreamText(input: EmotionSignalTextInput | string): Live2DExpressionOrchestratorResult {
    const signal = this.stabilizer.push(this.estimator.estimate(input));
    return this.applySignal(signal);
  }

  pushFinalIntent(
    intent: EmotionIntent,
    options: EmotionIntentBlendOptions = {},
  ): Live2DExpressionOrchestratorResult {
    const streamIntent = this.lastSignal?.intent ?? { emotion: "neutral", intensity: 0.35 };
    const blended = blendEmotionIntents(streamIntent, intent, { amount: this.finalBlend, ...options });
    const signal = createSignalFromIntent(blended, defaultNow(), "final", 1, "final calibration");
    this.stabilizer.reset();
    return this.applySignal(signal);
  }

  pushSustain(options: EmotionSustainOptions = {}): Live2DExpressionOrchestratorResult | null {
    const baseSignal = this.lastNonSustainSignal ?? this.lastSignal;
    if (!baseSignal) return null;
    this.sustainStep += 1;
    return this.applySignal(createSustainSignal(baseSignal, this.sustainStep, options));
  }

  pushIntent(intent: EmotionIntent): Live2DExpressionOrchestratorResult {
    const signal = this.stabilizer.push(intent);
    return this.applySignal(signal);
  }

  private applySignal(signal: EmotionSignal): Live2DExpressionOrchestratorResult {
    if (signal.source !== "sustain") {
      this.lastNonSustainSignal = signal;
      this.sustainStep = 0;
    }
    this.lastSignal = signal;
    const result = this.target.pushIntent(signal.intent);
    this.lastResult = result;
    return { signal, result };
  }
}

export function createKeywordEmotionEstimator(options: KeywordEmotionEstimatorOptions = {}): KeywordEmotionEstimator {
  return new KeywordEmotionEstimator(options);
}

export function estimateEmotionSignal(input: EmotionSignalTextInput | string, options: KeywordEmotionEstimatorOptions = {}): EmotionSignal {
  return new KeywordEmotionEstimator(options).estimate(input);
}

export function getDefaultEmotionSignalPresets(): EmotionSignalRule[] {
  return DEFAULT_EMOTION_SIGNAL_PRESETS.map((preset) => ({ ...preset, patterns: [...preset.patterns] }));
}

export function resolveEmotionSignalPreset(intent: EmotionIntent): EmotionSignalRule | null {
  if (intent.presetId) {
    return DEFAULT_EMOTION_SIGNAL_PRESETS.find((preset) => preset.presetId === intent.presetId) ?? null;
  }
  const toneMatch = intent.tone
    ? DEFAULT_EMOTION_SIGNAL_PRESETS.find((preset) =>
      !preset.presetOnly
      && preset.emotion === intent.emotion
      && preset.tone === intent.tone
    )
    : null;
  if (toneMatch) return toneMatch;
  return DEFAULT_EMOTION_SIGNAL_PRESETS.find((preset) => preset.emotion === intent.emotion && !preset.tone) ?? null;
}

export function materializeEmotionSignalPreset(intent: EmotionIntent): EmotionIntent {
  const preset = resolveEmotionSignalPreset(intent);
  if (!preset) return withResolvedMotionStyle(intent);
  if (!intent.presetId) {
    return withResolvedMotionStyle({
      ...intent,
      presetId: preset.presetId ?? null,
      presetLabel: intent.presetLabel ?? preset.presetLabel ?? null,
      facialStyle: intent.facialStyle ?? preset.facialStyle ?? null,
      motionStyle: intent.motionStyle ?? preset.motionStyle ?? null,
    });
  }
  return withResolvedMotionStyle({
    emotion: intent.emotion,
    tone: intent.tone ?? preset.tone ?? null,
    presetId: intent.presetId ?? preset.presetId ?? null,
    presetLabel: intent.presetLabel ?? preset.presetLabel ?? null,
    intensity: intent.intensity ?? preset.intensity,
    gaze: intent.gaze ?? preset.gaze ?? null,
    head: intent.head ?? preset.head ?? null,
    eyes: intent.eyes ?? preset.eyes ?? null,
    brows: intent.brows ?? preset.brows ?? null,
    mouth: intent.mouth ?? preset.mouth ?? null,
    facialStyle: intent.facialStyle ?? preset.facialStyle ?? null,
    motionStyle: intent.motionStyle ?? preset.motionStyle ?? null,
    specialExpression: intent.specialExpression ?? preset.specialExpression ?? null,
    durationMs: intent.durationMs,
  });
}

function withResolvedMotionStyle(intent: EmotionIntent): EmotionIntent {
  return {
    ...intent,
    motionStyle: resolveMotionPerformanceStyle(intent),
  };
}

export function createEmotionIntentStabilizer(options: EmotionIntentStabilizerOptions = {}): EmotionIntentStabilizer {
  return new EmotionIntentStabilizer(options);
}

export function createLive2DExpressionOrchestrator(
  options: Live2DExpressionOrchestratorOptions,
): Live2DExpressionOrchestrator {
  return new Live2DExpressionOrchestrator(options);
}

export function blendEmotionIntents(
  streamIntent: EmotionIntent,
  finalIntent: EmotionIntent,
  options: EmotionIntentBlendOptions = {},
): EmotionIntent {
  const amount = clamp(options.amount ?? 0.55, 0, 1);
  const finalSwitchAt = clamp(options.finalSwitchAt ?? 0.5, 0, 1);
  const streamIntensity = streamIntent.intensity ?? 0.45;
  const finalIntensity = finalIntent.intensity ?? 0.45;

  if (finalIntent.emotion === "neutral" && streamIntent.emotion !== "neutral" && !options.allowNeutralFinal) {
    const neutralAmount = clamp(options.neutralFinalAmount ?? amount * 0.35, 0, 1);
    return {
      ...streamIntent,
      intensity: lerp(streamIntensity, Math.max(0.18, finalIntensity), neutralAmount),
      durationMs: finalIntent.durationMs ?? streamIntent.durationMs,
    };
  }

  if (streamIntent.emotion === finalIntent.emotion || amount >= finalSwitchAt) {
    return {
      ...finalIntent,
      intensity: lerp(streamIntensity, finalIntensity, amount),
      durationMs: finalIntent.durationMs ?? streamIntent.durationMs,
    };
  }

  return {
    ...streamIntent,
    intensity: lerp(streamIntensity, Math.max(streamIntensity, finalIntensity), amount),
    durationMs: finalIntent.durationMs ?? streamIntent.durationMs,
  };
}

function matchRules(text: string, rules: EmotionSignalRule[]): {
  intent: EmotionIntent;
  confidence: number;
  matched: string[];
} {
  const normalized = text.toLowerCase();
  let best: { rule: EmotionSignalRule; score: number; matched: string[] } | null = null;
  for (const rule of rules) {
    const matched = rule.patterns
      .map((pattern) => patternMatches(normalized, pattern))
      .filter((value): value is string => Boolean(value));
    if (!matched.length) continue;
    const score = matched.length + (rule.confidence ?? 0.5);
    if (!best || score > best.score) best = { rule, score, matched };
  }
  if (!best) return { intent: { emotion: "neutral", intensity: 0.4 }, confidence: 0, matched: [] };
  return {
    intent: {
      emotion: best.rule.emotion,
      tone: best.rule.tone,
      presetId: best.rule.presetId,
      presetLabel: best.rule.presetLabel,
      intensity: best.rule.intensity ?? 0.55,
      gaze: best.rule.gaze,
      head: best.rule.head,
      eyes: best.rule.eyes,
      brows: best.rule.brows,
      mouth: best.rule.mouth,
      facialStyle: best.rule.facialStyle,
      motionStyle: best.rule.motionStyle,
      specialExpression: best.rule.specialExpression,
    },
    confidence: best.rule.confidence ?? 0.55,
    matched: best.matched,
  };
}

function selectReplyMatch(
  replyText: string,
  rules: EmotionSignalRule[],
): { match: ReturnType<typeof matchRules>; text: string } {
  const whole = matchRules(replyText, rules);
  const recentText = recentReplyWindow(replyText);
  if (!recentText || recentText === replyText.trim()) return { match: whole, text: replyText };

  const recent = matchRules(recentText, rules);
  if (recent.intent.emotion === "neutral") return { match: whole, text: replyText };
  if (whole.intent.emotion === "neutral") return { match: recent, text: recentText };

  const sameIntent = whole.intent.emotion === recent.intent.emotion && whole.intent.tone === recent.intent.tone;
  const recentStrength = recent.confidence + Math.min(2, recent.matched.length) * 0.12;
  const wholeStrength = whole.confidence + Math.min(2, whole.matched.length) * 0.08;
  if (!sameIntent && recentStrength >= wholeStrength - 0.35) {
    return { match: recent, text: recentText };
  }
  if (whole.intent.emotion === recent.intent.emotion && whole.intent.tone !== recent.intent.tone && recentStrength >= wholeStrength - 0.24) {
    return { match: recent, text: recentText };
  }
  return { match: whole, text: replyText };
}

function recentReplyWindow(replyText: string): string {
  const trimmed = replyText.trim();
  const tail = trimmed.slice(-160);
  const parts = tail
    .split(/[。！？!?…；;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const recent = parts.at(-1)?.trim() ?? "";
  if (recent.length >= 12) return recent;
  const expanded = parts.slice(-2).join("。").trim();
  return expanded || tail.slice(-120);
}

function patternMatches(text: string, pattern: string | RegExp): string | null {
  if (typeof pattern === "string") {
    const literal = pattern.toLowerCase();
    if (text.includes(literal)) return pattern;
    const normalizedLiteral = normalizeLiteralPattern(literal);
    return normalizedLiteral.length >= 2 && normalizeLiteralPattern(text).includes(normalizedLiteral) ? pattern : null;
  }
  const match = text.match(pattern);
  return match?.[0] ?? null;
}

function normalizeLiteralPattern(value: string): string {
  return value.replace(/[\s\u3000，。！？、；：,.!?;:'"“”‘’（）()[\]{}<>《》…—_-]+/g, "");
}

function isEmotionSignal(value: EmotionSignal | EmotionIntent): value is EmotionSignal {
  return Boolean((value as EmotionSignal).intent);
}

function signalEmotionsCompatible(current: EmotionName, next: EmotionName): boolean {
  if (current === next) return true;
  return SIGNAL_EMOTION_COMPATIBILITY[current]?.includes(next) ?? false;
}

const SIGNAL_EMOTION_COMPATIBILITY: Partial<Record<EmotionName, EmotionName[]>> = {
  happy: ["shy", "embarrassed", "teasing", "surprised"],
  shy: ["happy", "embarrassed", "teasing"],
  embarrassed: ["shy", "happy", "teasing"],
  surprised: ["happy", "panic"],
  teasing: ["happy", "shy", "embarrassed"],
  sad: ["crying", "confused"],
  crying: ["sad"],
  panic: ["surprised", "confused", "sad"],
};

function createSignalFromIntent(
  intent: EmotionIntent,
  timestampMs: number,
  source: EmotionSignalSource = "fallback",
  confidence = 1,
  reason = "explicit intent",
): EmotionSignal {
  const preset = resolveEmotionSignalPreset(intent);
  const resolvedIntent = withResolvedMotionStyle({
    ...intent,
    presetId: intent.presetId ?? preset?.presetId ?? null,
    presetLabel: intent.presetLabel ?? preset?.presetLabel ?? null,
  });
  return {
    source,
    intent: resolvedIntent,
    presetId: resolvedIntent.presetId ?? null,
    presetLabel: resolvedIntent.presetLabel ?? null,
    confidence,
    matched: [],
    held: false,
    timestampMs,
    reason,
  };
}

function createSustainSignal(
  baseSignal: EmotionSignal,
  step: number,
  options: EmotionSustainOptions,
): EmotionSignal {
  const baseIntent = baseSignal.intent;
  const cycles = DEFAULT_SUSTAIN_CYCLES[baseIntent.emotion];
  const amplitude = clamp(options.intensityAmplitude ?? 0.06, 0, 0.24);
  const baseIntensity = baseIntent.intensity ?? 0.45;
  const minIntensity = clamp(options.minIntensity ?? (baseIntent.emotion === "neutral" ? 0.05 : 0.12), 0, 1);
  const maxIntensity = clamp(options.maxIntensity ?? 0.9, minIntensity, 1);
  const intensity = clamp(baseIntensity + Math.sin(step * 1.17) * amplitude, minIntensity, maxIntensity);
  const intent: EmotionIntent = {
    ...baseIntent,
    intensity,
    durationMs: Math.max(1, Math.round(options.durationMs ?? baseIntent.durationMs ?? 900)),
  };
  assignCycleValue(intent, "gaze", options.gazeCycle ?? cycles.gazeCycle, step);
  assignCycleValue(intent, "head", options.headCycle ?? cycles.headCycle, step);
  assignCycleValue(intent, "eyes", options.eyesCycle ?? cycles.eyesCycle, step);
  assignCycleValue(intent, "brows", options.browsCycle ?? cycles.browsCycle, step);
  assignCycleValue(intent, "mouth", options.mouthCycle ?? cycles.mouthCycle, step);

  return {
    source: "sustain",
    intent,
    presetId: baseSignal.presetId,
    presetLabel: baseSignal.presetLabel,
    confidence: baseSignal.confidence,
    matched: baseSignal.matched,
    held: false,
    timestampMs: options.now?.() ?? defaultNow(),
    reason: `sustaining ${baseIntent.emotion}`,
  };
}

function assignCycleValue<K extends "gaze" | "head" | "eyes" | "brows" | "mouth">(
  intent: EmotionIntent,
  key: K,
  cycle: Array<string | null> | undefined,
  step: number,
): void {
  if (!cycle?.length) return;
  intent[key] = cycle[(step - 1) % cycle.length] ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function defaultNow(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
