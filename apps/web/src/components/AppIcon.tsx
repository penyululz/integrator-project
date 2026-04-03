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

function TelegramGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <path d="M4.8 11.7l14-6-4 12.5-3.6-3.4-2.1 2.2.5-3.6z" />
      <path d="M11.2 14.8l5.7-7.3" />
    </g>
  );
}

function WhatsAppGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <path d="M12 4.8a7.2 7.2 0 0 1 6.1 11l1.1 3.4-3.5-1a7.2 7.2 0 1 1-3.7-13.4z" />
      <path d="M9.7 9.8c.5 1.9 1.9 3.5 3.8 4.3" />
      <path d="M12.1 11.9l1.4-1.1" />
    </g>
  );
}

function AiGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <rect x="5.5" y="6" width="13" height="11.8" rx="2.8" />
      <path d="M9 10.2h6" />
      <path d="M9 13h6" />
      <circle cx="9" cy="17.2" r="1.2" />
      <circle cx="15" cy="17.2" r="1.2" />
    </g>
  );
}

function YouTubeGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <rect x="4.8" y="7.2" width="14.4" height="9.6" rx="3" />
      <path d="M11 10.3l3.6 1.7-3.6 1.7z" fill="currentColor" stroke="none" />
    </g>
  );
}

function RedditGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <circle cx="12" cy="12.4" r="4.6" />
      <circle cx="10.2" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
      <path d="M9.8 14.3c.7.6 1.4.9 2.2.9s1.5-.3 2.2-.9" />
      <path d="M13.9 7.8l1.8-1" />
      <circle cx="16.5" cy="6.4" r="1.1" />
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

function HttpGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <path d="M4.8 7.2h14.4v9.6H4.8z" />
      <path d="M8.2 10.5h7.6" />
      <path d="M8.2 13.4h4.8" />
    </g>
  );
}

function SchedulerGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <circle cx="12" cy="12" r="7.4" />
      <path d="M12 8.4v4.1l2.9 2" />
    </g>
  );
}

function GraphqlGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9">
      <path d="M12 4.8l5.8 3.4v6.6L12 18.2l-5.8-3.4V8.2z" />
      <path d="M12 4.8v13.4" />
      <path d="M6.2 8.2l11.6 6.6" />
      <path d="M17.8 8.2L6.2 14.8" />
    </g>
  );
}

function CodeGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <path d="M9.2 8.5l-3.1 3.5 3.1 3.5" />
      <path d="M14.8 8.5l3.1 3.5-3.1 3.5" />
      <path d="M13.2 6.8l-2.4 10.4" />
    </g>
  );
}

function DatabaseGlyph() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
      <ellipse cx="12" cy="7.1" rx="5.8" ry="2.7" />
      <path d="M6.2 7.1v9.8c0 1.5 2.6 2.7 5.8 2.7s5.8-1.2 5.8-2.7V7.1" />
      <path d="M6.2 12c0 1.5 2.6 2.7 5.8 2.7s5.8-1.2 5.8-2.7" />
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
    ) : props.iconKey === "telegram" ? (
      <TelegramGlyph />
    ) : props.iconKey === "whatsapp" ? (
      <WhatsAppGlyph />
    ) : props.iconKey === "ai" ? (
      <AiGlyph />
    ) : props.iconKey === "youtube" ? (
      <YouTubeGlyph />
    ) : props.iconKey === "reddit" ? (
      <RedditGlyph />
    ) : props.iconKey === "shopify" ? (
      <ShopifyGlyph />
    ) : props.iconKey === "sheets" ? (
      <SheetsGlyph />
    ) : props.iconKey === "email" ? (
      <EmailGlyph />
    ) : props.iconKey === "webhook" ? (
      <WebhookGlyph />
    ) : props.iconKey === "http" ? (
      <HttpGlyph />
    ) : props.iconKey === "scheduler" ? (
      <SchedulerGlyph />
    ) : props.iconKey === "graphql" ? (
      <GraphqlGlyph />
    ) : props.iconKey === "code" ? (
      <CodeGlyph />
    ) : props.iconKey === "database" ? (
      <DatabaseGlyph />
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
