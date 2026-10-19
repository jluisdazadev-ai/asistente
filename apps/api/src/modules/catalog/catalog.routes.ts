import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@crm/database';
import { generateEmbedding } from '../../lib/gemini';

export const catalogRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Listar Productos
  fastify.get('/products', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const products = await prisma.product.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ products });
  });

  // 2. Crear Producto
  fastify.post('/products', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const body = request.body as any;

    const product = await prisma.product.create({
      data: {
        tenantId,
        sku: body.sku,
        name: body.name,
        description: body.description,
        category: body.category,
        price: body.price,
        costPrice: body.costPrice,
        stockQuantity: body.stockQuantity ?? 0,
        isStockActive: body.isStockActive ?? true,
        imageUrl: body.imageUrl,
        variants: body.variants || [],
      },
    });

    return reply.send({ product });
  });

  // 3. Actualizar Producto y Stock
  fastify.put('/products/:id', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const updated = await prisma.product.updateMany({
      where: { id, tenantId },
      data: {
        name: body.name,
        description: body.description,
        category: body.category,
        price: body.price,
        costPrice: body.costPrice,
        stockQuantity: body.stockQuantity,
        isStockActive: body.isStockActive,
        imageUrl: body.imageUrl,
        variants: body.variants,
      },
    });

    return reply.send({ success: true, count: updated.count });
  });

  // 4. Ingesta de Documento RAG (PDF / Excel / Texto plano)
  fastify.post('/rag/ingest', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { fileName, fileContent, fileType } = request.body as {
      fileName: string;
      fileContent: string; // Texto extraído del PDF o documento
      fileType: string;
    };

    if (!fileContent || fileContent.trim().length === 0) {
      return reply.status(400).send({ error: 'El contenido del documento no puede estar vacío.' });
    }

    // 1. Crear registro de documento
    const doc = await prisma.knowledgeDocument.create({
      data: {
        tenantId,
        fileName,
        fileUrl: 'internal://' + fileName,
        fileType: fileType || 'text/plain',
        status: 'PROCESSING',
      },
    });

    // 2. Dividir en fragmentos (chunks de aprox 600 caracteres con solapamiento)
    const chunkSize = 600;
    const overlap = 100;
    const chunks: string[] = [];

    for (let i = 0; i < fileContent.length; i += chunkSize - overlap) {
      const chunk = fileContent.slice(i, i + chunkSize).trim();
      if (chunk.length > 30) chunks.push(chunk);
    }

    console.log(`📚 [RAG Ingest] Generando ${chunks.length} embeddings vectoriales para "${fileName}"...`);

    // 3. Generar vector embeddings con Gemini e insertar en PostgreSQL con pgvector
    for (let index = 0; index < chunks.length; index++) {
      const chunkText = chunks[index];
      const vector = await generateEmbedding(chunkText);
      const vectorSql = `[${vector.join(',')}]`;

      await prisma.$executeRaw`
        INSERT INTO knowledge_embeddings (id, tenant_id, document_id, chunk_index, content, embedding, metadata, created_at)
        VALUES (
          gen_random_uuid(),
          ${tenantId}::uuid,
          ${doc.id}::uuid,
          ${index},
          ${chunkText},
          ${vectorSql}::vector,
          '{}'::jsonb,
          NOW()
        );
      `;
    }

    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: {
        status: 'READY',
        totalChunks: chunks.length,
      },
    });

    return reply.send({
      success: true,
      documentId: doc.id,
      totalChunks: chunks.length,
      message: 'Documento indexado vectorialmente con éxito en la base de datos.',
    });
  });

  // 5. Listar Documentos RAG
  fastify.get('/rag/documents', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const documents = await prisma.knowledgeDocument.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ documents });
  });
};
