module.exports = class UserDTO {
    id;
    name;
    email;
    phone;
    avatarUrl;
    role;
    createdAt;

    constructor(model) {
        this.id = model._id;
        this.name = model.name;
        this.email = model.email;
        this.phone = model.phone;
        this.avatarUrl = model.avatarUrl;
        this.role = model.role;
        this.createdAt = model.createdAt
    }
};