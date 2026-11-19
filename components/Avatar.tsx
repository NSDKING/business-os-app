import Icon from "./Icon";

type IconName = Parameters<typeof Icon>[0]["name"];
export default function Avatar({ name, src, size = 36, icon }: { name: string; src?: string | null; size?: number; icon?: IconName }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  const style = { width: size, height: size, borderRadius: "50%", flex: "none" as const };
  if (src) return (/* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt={name} style={{ ...style, objectFit: "cover" }} />);
  if (icon) return <div style={{ ...style, background: "var(--surface2)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={Math.round(size * 0.46)} /></div>;
  return <div style={{ ...style, background: "var(--soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4 }}>{initials}</div>;
}
