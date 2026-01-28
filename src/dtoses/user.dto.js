class UserDto {
    email;
    id;
    role;
    name;

    constructor(model) {
        this.id = model._id;
        this.email = model.email;
        this.role = model.role;
        this.name = model.name;
    }
};

module.exports = UserDto;