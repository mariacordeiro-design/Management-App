"use client";
import { useEffect, useState } from "react";
import { useUser } from "../../components/UserProvider";
import { useRouter } from "next/navigation";
import { getUserByIstId } from "../api/airtable/airtable";

export default function Login() {
  const { setUser } = useUser();
  const [input, setInput] = useState("");
  const router = useRouter();

  /* Quando página carrega, verifica se o utilizador está guardado no localStorage */
  useEffect(() => {
    const savedId = localStorage.getItem("user");
    if (savedId) {
      setInput(savedId);
    }
  }, []);

  /* Verifica se o utilizador existe e faz login */
  const handleLogin = async () => {
    if (input.trim() !== "") {
      const user = await getUserByIstId(Number(input));
      if (user) {
        setUser(user);
        router.push("/pessoal");
      } else {
        alert("Número IST inválido. Tente novamente.");
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <main className="flex flex-col items-center text-center bg-white p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-black">Insere o teu número</h1>

        <input
          className="mt-4 p-2 text-center w-[80%] outline outline-blue-600 rounded-lg text-black"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              handleLogin();
            }
          }}
        />

        <button onClick={handleLogin} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded">
          Iniciar sessão
        </button>
      </main>
    </div>
  );
}
