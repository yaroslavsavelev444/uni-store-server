module.exports = class UserDto {
    email;
    id;
    isActivated;
    role;
    name;
    surname;

    constructor(model) {
        this.id = model._id;
        this.email = model.email;
        this.isActivated = model.activations.emailVerified;
        this.role = model.role;
        this.name = model.name;
        this.surname = model.surname;
    }
};