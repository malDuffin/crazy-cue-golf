export type Vec3 = { x: number; y: number; z: number };

export type TourId = "easy" | "medium" | "hard" | "expert";
export type ThemeId = "meadow" | "canyon" | "neon" | "storm";
export type LayoutId =
  | "fairway"
  | "dogleg"
  | "ramps"
  | "banks"
  | "windmill"
  | "gates"
  | "slalom"
  | "funnel"
  | "zigzag"
  | "halfpipe"
  | "chicane"
  | "ridge"
  | "needle"
  | "fortress"
  | "switchback"
  | "launch"
  | "islands"
  | "gauntlet";

export type HoleDef = {
  id: number;
  name: string;
  par: number;
  tee: Vec3;
  cup: Vec3;
  camFocus: Vec3;
  description: string;
  tour: TourId;
  theme: ThemeId;
  layout: LayoutId;
  cupRadius: number;
  mill?: Vec3;
};

export const TOURS: Record<
  TourId,
  { label: string; blurb: string; theme: ThemeId; start: number; end: number; color: string }
> = {
  easy: { label: "Easy", blurb: "Wide cups, open greens", theme: "meadow", start: 1, end: 10, color: "#7dffb0" },
  medium: { label: "Medium", blurb: "Ramps, banks, the mill", theme: "canyon", start: 11, end: 20, color: "#f4c14a" },
  hard: { label: "Hard", blurb: "Gates and chicanes", theme: "neon", start: 21, end: 30, color: "#7dd3fc" },
  expert: { label: "Expert", blurb: "Tiny cups, stingy kits", theme: "storm", start: 31, end: 40, color: "#c084fc" },
};
