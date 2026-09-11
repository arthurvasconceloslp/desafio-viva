import Image from "next/image";
import Link from "next/link";
import { EVENT } from "@/lib/config";

const NAV_LINKS = [
  { href: "/", label: "Evento" },
  { href: "/percurso", label: "Percurso" },
  { href: "/inscricao", label: "Inscrição" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt={EVENT.name}
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
            priority
          />
          <span className="text-sm font-semibold text-gray-800 sm:text-base">
            {EVENT.name}
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-gray-600 sm:gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-brand"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
