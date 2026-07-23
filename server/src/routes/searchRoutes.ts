import { Router } from 'express';
import { globalSearch } from '../controllers/searchController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);
router.get('/', globalSearch);

export default router;
