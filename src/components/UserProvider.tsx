"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { User } from "../components/Interfaces";

// 3. Create the Context
const UserContext = createContext<{
  user: User | null;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  isLider: boolean;
}>({
  user: null,
  setUser: () => {},
  isLoading: true, // Default to loading
  isLider: false,
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Track loading state
  const isLider = user ? hasPermission(user.funcao) : false;

  // Load from localStorage ONCE when app loads
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        // We must parse the JSON string back into an object
        setUserState(JSON.parse(stored));
      } catch (error) {
        console.error("Failed to parse user data:", error);
        localStorage.removeItem("user"); // Clean up corrupt data
      }
    }
    setIsLoading(false); // Loading complete
  }, []);

  // When value changes, save to (or remove from) localStorage
  const setUser = (newUser: User | null) => {
    setUserState(newUser);

    if (newUser) {
      // Store object as a JSON string
      localStorage.setItem("user", JSON.stringify(newUser));
    } else {
      // If null is passed (logout), remove from storage
      localStorage.removeItem("user");
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser, isLoading, isLider }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

export function hasPermission(role: string): boolean {
  const regex = /^(Sublíder|Líder|Diretor Técnico|Business Manager)(?: de .+)?$/;
  return regex.test(role);
}
