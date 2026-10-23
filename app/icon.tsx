import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        background: "#2563eb",
        color: "white",
        fontSize: 48,
        fontWeight: 700,
      }}
    >
      +
    </div>,
    size,
  );
}
