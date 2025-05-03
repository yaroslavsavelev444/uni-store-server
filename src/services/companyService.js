const ApiError = require("../exceptions/api-error");
const { CompanyModel } = require("../models/indexModels");

const uploadCompanyData = async (companyData) => {
    try {
       const company = await new CompanyModel(companyData);
       return await company.save();;
    } catch (e) {
        throw ApiError.InternalServerError(e.message || "Ошибка загрузки компании");
    }
};

const updateCompanyData = async (companyData) => {
    try {
        const company = await CompanyModel.findByIdAndUpdate({ _id: companyData._id }, companyData);
        return company;deleteOrgData
    } catch (e) {
        throw ApiError.InternalServerError(e.message || "Ошибка обновления компании");
    }
};

module.exports = {
    uploadCompanyData,
    updateCompanyData,
};