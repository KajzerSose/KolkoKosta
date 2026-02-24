"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ProductCard from "@/components/ProductCard";
import type { ProductWithPrices } from "@/lib/cijene";

const POPULAR_SEARCHES = [
  "mlijeko",
  "kruh",
  "jaja",
  "maslac",
  "jogurt",
  "sir",
  "piletina",
  "tjestenina",
  "riža",
  "ulje",
];

const MAJOR_CITIES = [
  "Zagreb",
  "Split",
  "Rijeka",
  "Osijek",
  "Zadar",
  "Slavonski Brod",
  "Pula",
  "Karlovac",
  "Sisak",
  "Varaždin",
  "Šibenik",
  "Dubrovnik",
  "Bjelovar",
  "Koprivnica",
  "Čakovec",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("Zagreb");
  const [cities, setCities] = useState<string[]>(MAJOR_CITIES);
  const [products, setProducts] = useState<ProductWithPrices[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataDate, setDataDate] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // Load cities on mount
  useEffect(() => {
    fetch("/api/cities")
      .then((r) => r.json())
      .then((data) => {
        if (data.cities?.length > 0) {
          setCities(data.cities);
        }
      })
      .catch(() => {
        // Keep default cities
      });
  }, []);

  // Close city dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const doSearch = useCallback(
    async (searchQuery: string, searchCity: string) => {
      if (!searchQuery.trim()) {
        setProducts([]);
        setHasSearched(false);
        return;
      }

      setLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const params = new URLSearchParams({
          q: searchQuery,
          city: searchCity,
        });
        const res = await fetch(`/api/search?${params}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setProducts(data.products || []);
        setDataDate(data.date || "");
      } catch {
        setError("Greška pri pretraživanju. Pokušajte ponovo.");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (query.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        doSearch(query, city);
      }, 500);
    } else if (query.trim().length === 0) {
      setProducts([]);
      setHasSearched(false);
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, city, doSearch]);

  const filteredCities = cities.filter((c) =>
    c.toLowerCase().includes(citySearch.toLowerCase())
  );

  const handleCitySelect = (selectedCity: string) => {
    setCity(selectedCity);
    setCitySearch("");
    setShowCityDropdown(false);
  };

  const handlePopularSearch = (term: string) => {
    setQuery(term);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛒</span>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-none">
                Kolko Kosta
              </h1>
              <p className="text-xs text-gray-500">Usporedba cijena</p>
            </div>
          </div>

          {/* City Selector */}
          <div className="relative ml-auto" ref={cityDropdownRef}>
            <button
              onClick={() => setShowCityDropdown(!showCityDropdown)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors"
            >
              <span>📍</span>
              <span>{city}</span>
              <span className="text-gray-400">▾</span>
            </button>

            {showCityDropdown && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    type="text"
                    placeholder="Pretraži gradove..."
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredCities.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleCitySelect(c)}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors ${
                        c === city
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700"
                      }`}
                    >
                      {c === city && <span className="mr-2">✓</span>}
                      {c}
                    </button>
                  ))}
                  {filteredCities.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Nema rezultata
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Hero Section */}
        {!hasSearched && (
          <div className="text-center mb-8 pt-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Pronađite najjeftiniju cijenu
            </h2>
            <p className="text-gray-500 text-lg">
              Usporedite cijene u svim supermarketima u{" "}
              <span className="text-blue-600 font-medium">{city}</span>
            </p>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative mb-4">
          <div className="flex items-center bg-white rounded-2xl border-2 border-gray-200 focus-within:border-blue-400 shadow-sm transition-colors overflow-hidden">
            <span className="pl-4 text-gray-400 text-xl">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pretraži proizvode (npr. mlijeko, kruh, jaja...)"
              className="flex-1 px-3 py-4 text-base bg-transparent focus:outline-none text-gray-900 placeholder-gray-400"
              autoFocus
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setProducts([]);
                  setHasSearched(false);
                }}
                className="pr-4 text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Popular Searches */}
        {!hasSearched && (
          <div className="mb-8">
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
              Popularne pretrage
            </p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SEARCHES.map((term) => (
                <button
                  key={term}
                  onClick={() => handlePopularSearch(term)}
                  className="text-sm bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600 px-3 py-1.5 rounded-full transition-colors capitalize"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Data Date Info */}
        {dataDate && hasSearched && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400">
              Podaci za:{" "}
              <span className="font-medium text-gray-600">
                {new Date(dataDate).toLocaleDateString("hr-HR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </p>
            {products.length > 0 && (
              <p className="text-xs text-gray-400">
                {products.length} {products.length === 1 ? "rezultat" : "rezultata"}
              </p>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-100 rounded-full" />
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
            </div>
            <div className="text-center">
              <p className="text-gray-600 font-medium">Pretraživanje cijena...</p>
              <p className="text-sm text-gray-400 mt-1">
                Dohvaćamo podatke iz svih supermarketa
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
            <p className="text-red-600 font-medium">⚠️ {error}</p>
            <button
              onClick={() => doSearch(query, city)}
              className="mt-3 text-sm text-red-500 hover:text-red-700 underline"
            >
              Pokušaj ponovo
            </button>
          </div>
        )}

        {/* No Results */}
        {!loading && !error && hasSearched && products.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Nema rezultata
            </h3>
            <p className="text-gray-500">
              Nismo pronašli &quot;{query}&quot; u {city}.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Pokušajte s drugačijim pojmom ili odaberite drugi grad.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && products.length > 0 && (
          <div className="space-y-4">
            {products.map((product, index) => (
              <ProductCard
                key={`${product.product.barcode}-${index}`}
                product={product}
                city={city}
              />
            ))}
          </div>
        )}

        {/* Info Section */}
        {!hasSearched && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 text-center">
              <div className="text-3xl mb-3">🏪</div>
              <h3 className="font-semibold text-gray-800 mb-1">20+ trgovina</h3>
              <p className="text-sm text-gray-500">
                Konzum, Spar, Lidl, Kaufland, Plodine, Tommy i još mnogo više
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 text-center">
              <div className="text-3xl mb-3">📅</div>
              <h3 className="font-semibold text-gray-800 mb-1">Dnevno ažuriranje</h3>
              <p className="text-sm text-gray-500">
                Cijene se automatski ažuriraju svaki dan
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 text-center">
              <div className="text-3xl mb-3">📈</div>
              <h3 className="font-semibold text-gray-800 mb-1">Povijest cijena</h3>
              <p className="text-sm text-gray-500">
                Pratite kako su se cijene mijenjale kroz tjedne i mjesece
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <p className="text-sm text-gray-400">
            Podaci preuzeti s{" "}
            <a
              href="https://cijene.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              cijene.dev
            </a>{" "}
            · Temeljem Odluke NN 75/2025
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Kolko Kosta nije povezan s navedenim trgovačkim lancima
          </p>
        </div>
      </footer>
    </div>
  );
}
