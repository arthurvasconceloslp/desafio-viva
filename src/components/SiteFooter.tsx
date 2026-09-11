import { EVENT } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
      <p>
        {EVENT.name} — {new Date().getFullYear()}
      </p>
      <p className="mt-1">
        <a href="/admin" className="hover:text-gray-600">
          Acesso administrativo
        </a>
      </p>
    </footer>
  );
}
