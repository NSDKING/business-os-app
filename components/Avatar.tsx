export default function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  const style = { width: size, height: size, borderRadius: "50%", flex: "none" as const };
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={name} style={{ ...style, objectFit: "cover" }} />
    : <div style={{ ...style, background: "var(--soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4 }}>{initials}</div>;
}
