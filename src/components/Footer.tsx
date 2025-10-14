"use client";

import React from "react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-zinc-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto max-w-7xl px-4 py-6 text-center">
        <p className="text-[14px] text-zinc-600">
          © {year} SCT Logistics · All rights reserved.
        </p>
        <p className="text-[12px] text-zinc-500">
          Developed by Hòa Nguyễn (Justin)
        </p>
      </div>
    </footer>
  );
}
