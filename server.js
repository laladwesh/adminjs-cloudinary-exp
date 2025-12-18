import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import * as AdminJSPkg from 'adminjs';
import * as AdminJSExpressPkg from '@adminjs/express';
const AdminJS = AdminJSPkg.default ?? AdminJSPkg;
const AdminJSExpress = AdminJSExpressPkg.default ?? AdminJSExpressPkg;
const ComponentLoader = AdminJSPkg.ComponentLoader ?? AdminJSPkg.default?.ComponentLoader;
import * as AdminJSMongoosePkg from '@adminjs/mongoose';
import uploadFeaturePkg from '@adminjs/upload';
const AdminJSMongoose = AdminJSMongoosePkg.default ?? AdminJSMongoosePkg;
const uploadFeature = uploadFeaturePkg.default ?? uploadFeaturePkg;
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

AdminJS.registerAdapter(AdminJSMongoose);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

import Image from './models/image.js';
import { BaseProvider } from '@adminjs/upload';

class CloudinaryProvider extends BaseProvider {
  constructor(options) {
    super(options?.bucket, options?.opts);
    this.cloudinary = cloudinary;
  }

  async upload(file, key) {
    try {
      const result = await this.cloudinary.uploader.upload(file.path, {
        public_id: key,
        resource_type: 'image',
      });
      console.log('Cloudinary upload result:', result.public_id, result.secure_url);
      return result;
    } catch (err) {
      console.error('Cloudinary upload error:', err);
      throw err;
    }
  }

  async delete(key) {
    try {
      const result = await this.cloudinary.uploader.destroy(key);
      console.log('Cloudinary delete result for', key, result);
      return result;
    } catch (err) {
      console.error('Cloudinary delete error for', key, err);
      throw err;
    }
  }

  path(key) {
    return this.cloudinary.url(key);
  }
}

async function start() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/adminjs-cloud');

  const componentLoaderInstance = new ComponentLoader();

  const adminJs = new AdminJS({
    componentLoader: componentLoaderInstance,
    resources: [
      {
        resource: Image,
        options: {
          properties: {
            imageUrl: { isVisible: { list: true, show: true, edit: false, filter: false }, isTitle: true }
          },
          actions: {
            new: {
              after: async (response, request, context) => {
                  const { record } = context;
                  if (record && record.isValid && record.isValid()) {
                    const publicId = record.params.imageUrl;
                    if (publicId) {
                      try {
                        const resource = await cloudinary.api.resource(publicId);
                        const url = resource?.secure_url ?? cloudinary.url(publicId);
                        await record.update({ imageUrl: url });
                      } catch (err) {
                        const url = cloudinary.url(publicId);
                        await record.update({ imageUrl: url });
                      }
                    }
                  }
                  return response;
                }
            },
            edit: {
              after: async (response, request, context) => {
                  const { record } = context;
                  if (record && record.isValid && record.isValid()) {
                    const publicId = record.params.imageUrl;
                    if (publicId) {
                      try {
                        const resource = await cloudinary.api.resource(publicId);
                        const url = resource?.secure_url ?? cloudinary.url(publicId);
                        await record.update({ imageUrl: url });
                      } catch (err) {
                        const url = cloudinary.url(publicId);
                        await record.update({ imageUrl: url });
                      }
                    }
                  }
                  return response;
                }
            }
          }
        },
        features: [
          uploadFeature({
            componentLoader: componentLoaderInstance,
            provider: {
              base: new CloudinaryProvider({ bucket: 'images' })
            },
            properties: {
              key: 'imageUrl',   // temporarily stores public id into `imageUrl`, after hook we'll replace with secure_url
              file: 'upload'    // virtual property, shows the file input in the form
            },
            validation: {
              mimeTypes: ['image/jpeg', 'image/png', 'image/gif']
            },
            uploadPath: (record, filename) => {
              const name = path.parse(filename).name; // strip extension to avoid double extensions
              return `images/${Date.now()}-${name}`;
            }
          })
        ]
      }
    ],
    rootPath: '/admin',
  });

  // In development, bundle/watch user components so upload UI components are available
  if (process.env.NODE_ENV !== 'production') {
    await adminJs.watch();
  }

  // AdminJS authentication
  const ADMIN = {
    email: process.env.ADMIN_EMAIL || 'g.avinash@iitg.ac.in',
    password: process.env.ADMIN_PASSWORD || 'admin'
  };

  const cookiePassword = process.env.ADMIN_COOKIE_PASSWORD || 'super-secret-adminjs-cookie-password-1234567890';

  const router = AdminJSExpress.buildAuthenticatedRouter(
    adminJs,
    {
      authenticate: async (email, password) => {
        if (email === ADMIN.email && password === ADMIN.password) {
          return { email: ADMIN.email };
        }
        return null;
      },
      cookieName: process.env.ADMIN_COOKIE_NAME || 'adminjs',
      cookiePassword,
    },
    null,
    {
      resave: false,
      saveUninitialized: true,
    }
  );

  const app = express();
  app.use(adminJs.options.rootPath, router);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`AdminJS started at http://localhost:${port}${adminJs.options.rootPath}`);
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
