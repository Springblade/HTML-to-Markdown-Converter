'use client';

import { useEffect, useState } from 'react';
import { siteConfig } from '@/config/site';

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-10 bg-white transition-shadow duration-200 ${
        scrolled ? 'shadow-md' : 'shadow-none'
      }`}
    >
      <div className="mx-auto max-w-5xl px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">
          {siteConfig.name}
        </h1>
      </div>
    </header>
  );
}
