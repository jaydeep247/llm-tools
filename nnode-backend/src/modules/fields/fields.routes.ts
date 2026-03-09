import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { FieldsController } from './fields.controller';

const router = Router();
const fieldsController = new FieldsController();

router.post('/seo/extract', authMiddleware, fieldsController.getSeoExtract);

export default router;
