import { EVENT } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
      <p>
        {EVENT.name} — {new Date().getFullYear()}
      </p>
    </footer>
  );
}
