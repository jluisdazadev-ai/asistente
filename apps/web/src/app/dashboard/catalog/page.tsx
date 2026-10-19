'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingBag,
  FileText,
  Plus,
  CheckCircle2,
  AlertCircle,
  Tag,
  DollarSign,
  Layers,
  Sparkles,
  Upload,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export default function CatalogPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'rag'>('catalog');
  const [products, setProducts] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario nuevo producto
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProd, setNewProd] = useState({
    name: '',
    category: 'Hamburguesas',
    price: 25000,
    description: '',
    stockQuantity: 50,
    isStockActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
  });

  // Formulario RAG
  const [ragDoc, setRagDoc] = useState({
    fileName: 'Politicas_Garantia_y_Envios.txt',
    fileContent: '',
    fileType: 'text/plain',
  });
  const [ingestingRag, setIngestingRag] = useState(false);
  const [ragSuccess, setRagSuccess] = useState('');

  const loadData = async () => {
    try {
      const [resProd, resDocs] = await Promise.all([
        fetchWithAuth('/products'),
        fetchWithAuth('/rag/documents'),
      ]);
      const dataProd = await resProd.json();
      const dataDocs = await resDocs.json();
      if (dataProd.products) setProducts(dataProd.products);
      if (dataDocs.documents) setDocuments(dataDocs.documents);
    } catch (err) {
      console.error('Error cargando catálogo:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name || !newProd.price) return;

    try {
      const res = await fetchWithAuth('/products', {
        method: 'POST',
        body: JSON.stringify(newProd),
      });
      const data = await res.json();
      if (data.product) {
        setProducts((prev) => [data.product, ...prev]);
        setShowProductModal(false);
        setNewProd({
          name: '',
          category: 'Hamburguesas',
          price: 25000,
          description: '',
          stockQuantity: 50,
          isStockActive: true,
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
        });
      }
    } catch (err) {
      console.error('Error creando producto:', err);
    }
  };

  const handleToggleStock = async (product: any) => {
    const updatedStatus = !product.isStockActive;
    try {
      await fetchWithAuth(`/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isStockActive: updatedStatus }),
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isStockActive: updatedStatus } : p))
      );
    } catch (err) {
      console.error('Error actualizando stock:', err);
    }
  };

  const handleIngestRag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragDoc.fileContent.trim()) return;

    setIngestingRag(true);
    setRagSuccess('');
    try {
      const res = await fetchWithAuth('/rag/ingest', {
        method: 'POST',
        body: JSON.stringify(ragDoc),
      });
      const data = await res.json();
      if (data.success) {
        setRagSuccess(`¡Documento indexado con éxito! Se crearon ${data.totalChunks} vectores en pgvector.`);
        setRagDoc({ ...ragDoc, fileContent: '' });
        loadData();
      }
    } catch (err) {
      console.error('Error en ingesta RAG:', err);
    } finally {
      setIngestingRag(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <ShoppingBag className="h-5 w-5 text-emerald-600" />
            <span>Catálogo Dinámico y RAG Vectorial</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Los productos y documentos subidos aquí son consultados en tiempo real por la IA mediante Function Calling y pgvector.
          </p>
        </div>

        {activeTab === 'catalog' && (
          <button
            onClick={() => setShowProductModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Producto</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-3 border-b border-slate-200 mb-6 shrink-0">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'catalog'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="h-4 w-4" />
          <span>1. Menú y Productos Relacionales ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rag')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'rag'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>2. Ingesta RAG / Documentos Grandes ({documents.length})</span>
        </button>
      </div>

      {/* PESTAÑA 1: Catálogo Relacional */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    {p.category || 'General'}
                  </span>
                  <button
                    onClick={() => handleToggleStock(p)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.isStockActive
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                    }`}
                  >
                    {p.isStockActive ? 'Disponible' : 'Agotado'}
                  </button>
                </div>

                <h3 className="text-sm font-bold text-slate-900">{p.name}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
              </div>

              <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm font-mono font-extrabold text-emerald-600">
                  ${Number(p.price).toLocaleString('es-CO')} COP
                </span>
                <span className="text-[10px] text-slate-400">Stock: {p.stockQuantity} unids</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PESTAÑA 2: Ingesta RAG */}
      {activeTab === 'rag' && (
        <div className="max-w-3xl space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Indexar Manual, PDF o Catálogo Extenso (RAG)</h3>
            <p className="text-xs text-slate-500 mb-4">
              Pega el texto de tu catálogo, preguntas frecuentes o políticas de servicio. El sistema generará vector embeddings mediante Gemini <strong>text-embedding-004</strong> y los almacenará en PostgreSQL con la extensión <strong>pgvector</strong>.
            </p>

            {ragSuccess && (
              <div className="mb-4 rounded-lg bg-emerald-100 border border-emerald-300 p-3 text-xs text-emerald-800 flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{ragSuccess}</span>
              </div>
            )}

            <form onSubmit={handleIngestRag} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Documento</label>
                <input
                  type="text"
                  value={ragDoc.fileName}
                  onChange={(e) => setRagDoc({ ...ragDoc, fileName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Ej. Manual_Servicio_Garantia.pdf"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contenido Textual Completo</label>
                <textarea
                  rows={8}
                  value={ragDoc.fileContent}
                  onChange={(e) => setRagDoc({ ...ragDoc, fileContent: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
                  placeholder="Pega aquí el contenido del PDF, políticas, términos de envío, ingredientes o especificaciones técnicas..."
                />
              </div>

              <button
                type="submit"
                disabled={ingestingRag || !ragDoc.fileContent.trim()}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                <span>{ingestingRag ? 'Procesando Embeddings en pgvector...' : 'Indexar en Base de Conocimiento'}</span>
              </button>
            </form>
          </div>

          {/* Documentos Indexados */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 mb-3">Documentos Vectorizados Actualmente</h4>
            {documents.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No hay documentos vectorizados aún.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {documents.map((d) => (
                  <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      <span className="font-semibold text-slate-800">{d.fileName}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-slate-500">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-mono">
                        {d.totalChunks} chunks vectorizados
                      </span>
                      <span className="text-emerald-600 font-semibold text-[10px]">Listo (RAG Activo)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Crear Producto */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">Agregar Producto al Menú</h3>
            <form onSubmit={handleCreateProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Producto</label>
                <input
                  type="text"
                  required
                  value={newProd.name}
                  onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2"
                  placeholder="Ej. Combo Hamburguesa Especial"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Precio COP</label>
                  <input
                    type="number"
                    required
                    value={newProd.price}
                    onChange={(e) => setNewProd({ ...newProd, price: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <input
                    type="text"
                    value={newProd.category}
                    onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción / Ingredientes</label>
                <textarea
                  rows={3}
                  value={newProd.description}
                  onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2"
                  placeholder="Ingredientes, términos y detalles para el asistente..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
