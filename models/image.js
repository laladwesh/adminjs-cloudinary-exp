import mongoose from 'mongoose';

const ImageSchema = new mongoose.Schema({
  imageKeys: { type: [String], default: [] },
  imageUrls: { type: [String], default: [] }
});

export default mongoose.model('Image', ImageSchema);
