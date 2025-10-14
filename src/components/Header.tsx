"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Phone, Mail } from "lucide-react";
import { usePathname } from "next/navigation";

const PHONE = "+84 867 314 219 (WhatsApp, Zalo, Wechat)";
const EMAIL = "justin@sctlogs.com";

export default function Header() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  // Đóng popover khi click ngoài / ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const isHomeActive = pathname === "/";
  const isContactActive = open /* || pathname === "/contact" */;

  return (
    <header className="site-header" role="banner">
      <div className="container">
        {/* Brand: LOGO (PNG 80×70, không scale) */}
        <Link href="/" className="brand" aria-label="SCT Logistics – Home">
          <div className="logoShell" aria-hidden>
            <Image
              src="/logo.png"   // PNG 80×70
              alt="SCT Logistics"
              width={80}
              height={70}
              priority
              quality={100}
              sizes="80px"
              style={{
                display: "block",
                width: "80px",
                height: "70px",
                objectFit: "contain",
              }}
            />
          </div>
        </Link>

        {/* Nav – 2 nút cùng style; active = xanh thương hiệu */}
        <nav className="nav" aria-label="Primary">
          <Link
            href="/"
            className="btnNav"
            data-active={isHomeActive ? "true" : undefined}
          >
            Home
          </Link>

          <button
            ref={btnRef}
            className="btnNav"
            data-active={isContactActive ? "true" : undefined}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls="contact-popover"
          >
            Contact
          </button>

          {open && (
            <div
              id="contact-popover"
              ref={popRef}
              role="dialog"
              aria-label="Contact information"
              className="popover"
            >
              <div className="popHeader">Contact</div>
              <div className="popBody">
                <a className="row" href={`tel:${PHONE.replace(/\s+/g, "")}`} title="Call">
                  <span className="ico"><Phone size={18} strokeWidth={2} /></span>
                  <span className="text">{PHONE}</span>
                </a>
                <a className="row" href={`mailto:${EMAIL}`} title="Email">
                  <span className="ico"><Mail size={18} strokeWidth={2} /></span>
                  <span className="text">{EMAIL}</span>
                </a>
              </div>
            </div>
          )}
        </nav>
      </div>

      <style jsx>{`
        :global(:root) { --header-h: 64px; }
        @media (max-width: 780px) { :global(:root) { --header-h: 56px; } }
        :global(html) { scroll-padding-top: var(--header-h); }
        :global(body) { padding-top: var(--header-h); }

        .site-header{
          --ink:#0f172a; --ink-2:#334155; --muted:#64748b;
          --line:#e6eaf2; --line-2:#d5dbea;
          --brand:#0ea5e9;
          --brand-ink:#0b3a55;
          --brand-bg:#eff8ff;
          --brand-border:#b9e0f7;

          position:fixed; top:0; left:0; right:0; height:var(--header-h); z-index:120;
          background:#ffffffcc; backdrop-filter:blur(10px) saturate(120%);
          border-bottom:1px solid #e9edf3;
          box-shadow:0 2px 10px rgba(15,23,42,.04);
        }
        .container{
          max-width:1200px; margin:0 auto; height:100%;
          padding:0 20px; display:flex; align-items:center; justify-content:space-between; gap:16px;
        }
        .brand{ display:inline-flex; align-items:center; text-decoration:none; color:var(--ink); }
        .logoShell{
          width:80px; height:70px; 
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
          /* hỗ trợ rõ nét hơn với PNG ở 1x (tuỳ trình duyệt): */
          image-rendering: crisp-edges;
          image-rendering: -webkit-optimize-contrast;
        }

        .nav{ display:inline-flex; align-items:center; gap:10px; }

        /* ===== Unified Premium Pill ===== */
        .btnNav{
          --h:36px;
          display:inline-flex; align-items:center; justify-content:center;
          height:var(--h); padding:0 16px; border-radius:999px;
          font-weight:700; font-size:14px; letter-spacing:.01em;
          color:var(--ink-2);
          background: linear-gradient(180deg, #ffffff, #fafbff);
          border:1px solid var(--line);
          box-shadow:
            inset 0 -1px 0 rgba(255,255,255,.8),
            0 1px 2px rgba(16,24,40,.05);
          transition:
            transform .12s ease,
            box-shadow .15s ease,
            border-color .15s ease,
            background .15s ease,
            color .15s ease;
          cursor:pointer;
          text-decoration:none;
        }
        .btnNav:hover{
          transform: translateY(-1px);
          background: linear-gradient(180deg, #ffffff, #f3f6fb);
          border-color: var(--line-2);
          box-shadow: 0 8px 22px rgba(2,6,23,.10);
          color: var(--ink);
        }
        .btnNav:active{ transform: translateY(0); box-shadow: 0 3px 10px rgba(2,6,23,.12); }
        .btnNav:focus-visible{
          outline: none;
          box-shadow:
            0 0 0 3px rgba(14,165,233,.22),
            0 6px 18px rgba(2,6,23,.10);
          border-color: rgba(14,165,233,.35);
        }
        .btnNav[data-active="true"]{
          background: linear-gradient(180deg, var(--brand-bg), #eaf4ff);
          border-color: var(--brand-border);
          color: var(--brand-ink);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.65),
            0 6px 18px rgba(14,165,233,.16);
        }
        .btnNav[data-active="true"]:hover{
          background: linear-gradient(180deg, #e8f3ff, #e3f0ff);
          border-color: #a8d8f3;
          color: #083244;
          box-shadow: 0 10px 24px rgba(14,165,233,.2);
        }

        .popover{
          position:absolute; top:46px; right:0; width:300px;
          background:#fff; border:1px solid #e5e7eb; border-radius:14px;
          box-shadow:0 12px 28px rgba(2,6,23,.1), 0 2px 8px rgba(2,6,23,.06);
          overflow:hidden; animation:pop .12s ease-out;
        }
        @keyframes pop{ from{ transform:translateY(-6px); opacity:0; } to{ transform:translateY(0); opacity:1; } }
        .popHeader{ padding:10px 14px; font-weight:700; font-size:13px; color:var(--ink);
          background:linear-gradient(180deg,#f8fafc,#f3f4f6); border-bottom:1px solid #eef2f7; }
        .popBody{ padding:10px 12px; display:grid; gap:6px; }
        .row{ display:grid; grid-template-columns:22px 1fr; align-items:center; gap:10px;
          text-decoration:none; padding:10px 10px; border-radius:10px; color:var(--ink);
          transition:background .15s, transform .15s; }
        .row:hover{ background:#f8fafc; transform:translateY(-1px); }
        .ico :global(svg){ stroke:var(--brand); width:18px; height:18px; }
        .row:hover .ico :global(svg){ stroke:#f59e0b; }
        .text{ font-size:14px; }

        @media (max-width:780px){
          .logoShell{ width:80px; height:70px; }
          .btnNav{ --h:34px; padding:0 12px; font-size:13px; }
        }
      `}</style>
    </header>
  );
}
