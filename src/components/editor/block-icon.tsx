import { AudioLines, LayoutList, Megaphone, Mic2, Music2 } from "lucide-react";
import { blockPresentation } from "@/lib/editor/presentation";
export function BlockIcon({ name }: { name: string }) {
  const kind = blockPresentation(name).kind;
  const Icon = {
    audio: AudioLines,
    activity: LayoutList,
    announcement: Megaphone,
    message: Mic2,
    music: Music2,
  }[kind];
  return <Icon size={19} aria-hidden="true" />;
}
