import { model, Schema } from "mongoose";

const TransportCompanySchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
	},
);

export default model("TransportCompany", TransportCompanySchema);
