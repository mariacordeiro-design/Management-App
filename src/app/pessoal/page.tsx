"use client";

import ProtectedPage from "@/src/components/ProtectedPage";
import { useUser } from "@/src/components/UserProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { JSX } from "react";

const baseClasses =
  "block w-full text-center px-6 py-3 rounded-lg font-medium shadow-md transition-colors focus:outline-none";

export default function Pessoal(): JSX.Element {
  const { user, setUser } = useUser();
  const router = useRouter();

  const routes = [
    { href: "/", label: "Meu Dashboard" },
    { href: "/pessoal/disponibilidade", label: "Minha Disponibilidade" },
    { href: "/login", label: "Terminar sessão", logout: true },
  ];

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
    router.push("/login");
  };

  const renderRoute = (r: (typeof routes)[number]) => {
    const className = r.logout
      ? `${baseClasses} bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600`
      : `${baseClasses} bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:from-indigo-700 hover:to-indigo-600`;

    if (r.logout) {
      return (
        <button key={r.href} onClick={handleLogout} className={className}>
          {r.label}
        </button>
      );
    }

    return (
      <Link key={r.href} href={r.href} className="w-full">
        <div className={className} aria-label={r.label}>
          {r.label}
        </div>
      </Link>
    );
  };

  return (
    <ProtectedPage>
      <main className="min-h-screen flex flex-col items-center pt-20 px-4">
        <h1 className="text-2xl font-semibold mb-8">Turnos de {user?.nome}</h1>

        <div className="w-full max-w-md flex flex-col items-center gap-4">
          {routes.map(renderRoute)}
        </div>
      </main>
    </ProtectedPage>
  );
}
