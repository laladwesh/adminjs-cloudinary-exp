import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import * as AdminJSPkg from "adminjs";
import * as AdminJSExpressPkg from "@adminjs/express";
const AdminJS = AdminJSPkg.default ?? AdminJSPkg;
const AdminJSExpress = AdminJSExpressPkg.default ?? AdminJSExpressPkg;
const ComponentLoader =
  AdminJSPkg.ComponentLoader ?? AdminJSPkg.default?.ComponentLoader;
import * as AdminJSMongoosePkg from "@adminjs/mongoose";
import uploadFeaturePkg from "@adminjs/upload";
const AdminJSMongoose = AdminJSMongoosePkg.default ?? AdminJSMongoosePkg;
const uploadFeature = uploadFeaturePkg.default ?? uploadFeaturePkg;
import { v2 as cloudinary } from "cloudinary";
import path from "path";

AdminJS.registerAdapter(AdminJSMongoose);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

import Image from "./models/image.js";
import { BaseProvider } from "@adminjs/upload";

async function seedUrlsGlobal(recordId, urls) {
  try {
    if (!recordId || !urls || !urls.length) return null;
    console.log(
      "Seeding imageUrls for record:",
      recordId,
      "count:",
      urls.length
    );
    const updated = await Image.findByIdAndUpdate(
      recordId,
      { $push: { imageUrls: { $each: urls } } },
      { new: true }
    );
    console.log("Seed result - imageUrls length:", updated?.imageUrls?.length);
    return updated;
  } catch (err) {
    console.error("Failed to seed imageUrls for", recordId, err);
    return null;
  }
}

class CloudinaryProvider extends BaseProvider {
  constructor(options) {
    super(options?.bucket, options?.opts);
    this.cloudinary = cloudinary;
  }
  async upload(file, key, context) {
    try {
      const result = await this.cloudinary.uploader.upload(file.path, {
        public_id: key,
        resource_type: "image",
      });
      console.log(
        "Cloudinary upload result:",
        result.public_id,
        result.secure_url
      );

      if (context?.record?.id()) {
        await seedUrlsGlobal(context.record.id(), [result.secure_url]);
      } else {
        await seedUrlsGlobal(null, [result.secure_url]);
      }

      return result;
    } catch (err) {
      console.error("Cloudinary upload error:", err);
      throw err;
    }
  }

  async delete(key, bucket, context) {
    try {
      const result = await this.cloudinary.uploader.destroy(key);
      console.log("Cloudinary delete result for", key, result);

      // If deletion is triggered from AdminJS context, remove corresponding URL from record
      try {
        if (context && context.record) {
          const record = context.record;
          const keys = record.get("imageKeys") || [];
          const urls = record.get("imageUrls") || [];
          const idx = Array.isArray(keys) ? keys.indexOf(key) : -1;
          if (idx !== -1) {
            const newUrls = urls.filter((_, i) => i !== idx);
            await record.update({ imageUrls: newUrls });
          }
        }
      } catch (updateErr) {
        console.warn(
          "Failed to remove imageUrl from record after delete:",
          updateErr
        );
      }

      return result;
    } catch (err) {
      console.error("Cloudinary delete error for", key, err);
      throw err;
    }
  }

  path(key) {
    return this.cloudinary.url(key);
  }
}

async function start() {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/adminjs-cloud"
  );

  const componentLoaderInstance = new ComponentLoader();

  const adminJs = new AdminJS({
    componentLoader: componentLoaderInstance,
    resources: [
      {
        resource: Image,
        options: {
          properties: {
            // explicitly declare these as string arrays to avoid adapter type inference issues
            imageKeys: { isVisible: false, type: 'string', isArray: true },
            // imageUrls are generated automatically by the upload feature; hide on edit/new
            imageUrls: {
              isVisible: {
                list: true,
                show: true,
                edit: false,
                filter: false,
                new: false,
              },
              type: 'string',
              isArray: true,
              components: {
                show: componentLoaderInstance.add(
                  "RefreshImages",
                  "./admin/components/RefreshImages"
                ),
              },
            },
          },
          actions: {
            // normalize list/show responses so frontend always receives arrays for multiple fields
            list: {
              after: async (response) => {
                if (response && response.records) {
                  response.records = response.records.map((rec) => {
                    const params = rec.params || {};
                    // ensure imageUrls is an array
                    if (!Array.isArray(params.imageUrls))
                      params.imageUrls = params.imageUrls
                        ? [params.imageUrls]
                        : [];
                    // ensure imageKeys is an array; if missing, copy imageUrls so `name[index]` exists
                    if (!Array.isArray(params.imageKeys))
                      params.imageKeys = params.imageKeys
                        ? [params.imageKeys]
                        : [...params.imageUrls];
                    rec.params = params;
                    return rec;
                  });
                }
                return response;
              },
            },
            show: {
              after: async (response) => {
                if (response && response.record) {
                  const params = response.record.params || {};
                  if (!Array.isArray(params.imageUrls))
                    params.imageUrls = params.imageUrls
                      ? [params.imageUrls]
                      : [];
                  if (!Array.isArray(params.imageKeys))
                    params.imageKeys = params.imageKeys
                      ? [params.imageKeys]
                      : [...params.imageUrls];
                  response.record.params = params;
                }
                return response;
              },
            },
          },
        },
        features: [
          uploadFeature({
            componentLoader: componentLoaderInstance,
            provider: {
              base: new CloudinaryProvider({ bucket: "images" }),
            },
            properties: {
              key: "imageKeys", // store public ids into `imageKeys`; provider path will be exposed as `imageUrls` at runtime
              file: "upload", // virtual property, shows the file input in the form
              filePath: "imageUrls",
            },
            multiple: true,
            validation: {
              mimeTypes: ["image/jpeg", "image/png", "image/gif"],
            },
            uploadPath: (record, filename) => {
              const name = path.parse(filename).name; // strip extension to avoid double extensions
              return `images/${Date.now()}-${name}`;
            },
          }),
        ],
      },
    ],
    rootPath: "/admin",
  });

  if (process.env.NODE_ENV !== "production") {
    await adminJs.watch();
  }

  // AdminJS authentication
  const ADMIN = {
    email: process.env.ADMIN_EMAIL || "g.avinash@iitg.ac.in",
    password: process.env.ADMIN_PASSWORD || "admin",
  };
  const router = AdminJSExpress.buildAuthenticatedRouter(
    adminJs,
    {
      authenticate: async (email, password) => {
        if (email === ADMIN.email && password === ADMIN.password) {
          return { email: ADMIN.email };
        }
        return null;
      },
      cookieName: process.env.ADMIN_COOKIE_NAME || "adminjs",
      cookiePassword:
        process.env.ADMIN_COOKIE_PASSWORD ||
        "supersecret-and-long-password-change-me-123!",
    },
    null,
    {
      resave: false,
      saveUninitialized: true,
    }
  );

  const app = express();

  // Public endpoint to fetch image URLs for a given Image record id.
  // This is used by the AdminJS frontend component to load stored image URLs.
  app.get(`${adminJs.options.rootPath}/api/image-urls/:id`, async (req, res) => {
    const { id } = req.params;
    try {
      if (!id) return res.status(400).json({ error: 'missing id' });
      const doc = await Image.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'not found' });
      return res.json({ imageUrls: Array.isArray(doc.imageUrls) ? doc.imageUrls : [] });
    } catch (err) {
      console.error('Error fetching imageUrls for', id, err);
      return res.status(500).json({ error: 'internal_error' });
    }
  });
  app.use(adminJs.options.rootPath, router);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(
      `AdminJS started at http://localhost:${port}${adminJs.options.rootPath}`
    );
  });
}
start().catch((err) => {
  console.error(err);
  process.exit(1);
});
