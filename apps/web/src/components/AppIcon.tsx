import type { AppIconKey } from "../pages/integrations-catalog-helpers";
import type { CSSProperties } from "react";

type AppIconProps = {
  iconKey: AppIconKey;
  accent?: string;
};

function SlackGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
      <path d="M8.5 4.5v5.3" />
      <path d="M12.2 4.5v5.3" />
      <path d="M4.5 8.5h5.3" />
      <path d="M4.5 12.2h5.3" />
      <path d="M14.5 12.2h5.3" />
      <path d="M14.5 15.9h5.3" />
      <path d="M12.2 14.5v5.3" />
      <path d="M15.9 14.5v5.3" />
    </g>
  );
}

function ShopifyGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8.8h12l-1 10.2H7z" />
      <path d="M9.2 8.8c0-2 1.4-3.8 3.6-3.8s3.6 1.8 3.6 3.8" />
      <path d="M11.1 13.3h3.3" strokeLinecap="round" />
    </g>
  );
}

function SheetsGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 4.8h8l3 3v11.4H8z" />
      <path d="M16 4.8v3h3" />
      <path d="M10.5 11h6" strokeLinecap="round" />
      <path d="M10.5 14h6" strokeLinecap="round" />
      <path d="M10.5 17h3.5" strokeLinecap="round" />
    </g>
  );
}

function EmailGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4.5" y="7" width="15" height="10" rx="2" />
      <path d="M5.8 8.6l6.2 5 6.2-5" />
    </g>
  );
}

function WebhookGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <path d="M7 8.8a3.2 3.2 0 0 1 3.2-3.2h2.1" />
      <path d="M17 15.2a3.2 3.2 0 0 1-3.2 3.2h-2.1" />
      <path d="M12.8 3.8l2.6 1.8-2.6 1.8" />
      <path d="M11.2 20.2l-2.6-1.8 2.6-1.8" />
    </g>
  );
}

function DefaultGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <path d="M8 8h8v8H8z" />
      <path d="M12 4.8v3.2" />
      <path d="M12 16v3.2" />
      <path d="M4.8 12H8" />
      <path d="M16 12h3.2" />
    </g>
  );
}

export function AppIcon(props: AppIconProps) {
  const glyph =
    props.iconKey === "slack" ? (
      <SlackGlyph />
    ) : props.iconKey === "shopify" ? (
      <ShopifyGlyph />
    ) : props.iconKey === "sheets" ? (
      <SheetsGlyph />
    ) : props.iconKey === "email" ? (
      <EmailGlyph />
    ) : props.iconKey === "webhook" ? (
      <WebhookGlyph />
    ) : (
      <DefaultGlyph />
    );

  return (
    <span
      className="app-icon-badge"
      style={
        props.accent
          ? ({
              color: props.accent,
            } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" role="img">
        {glyph}
      </svg>
    </span>
  );
}
