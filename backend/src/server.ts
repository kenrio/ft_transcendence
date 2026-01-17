import Fastify from 'fastify';
import cors from '@fastify/cors';
import { userRoutes } from './routes/userRoutes';

const fastify = Fastify({
    logger: true
});

// CORS設定 (Reactアプリからのリクエストを許可)
fastify.register(cors, {
    origin: true // 開発環境なので全て許可 (本番では制限を推奨)
});

fastify.get('/', async (request, reply) => {
	return { hello: 'world!!!!' }
});

// ルートの登録
fastify.register(userRoutes, { prefix: '/api' });

const start = async () => {
    try {
        await fastify.listen({port: 3000, host: '0.0.0.0' })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
};

start();
