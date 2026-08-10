import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    const hasUpperCase = /[A-Z]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);

    return value.length >= 8 && hasUpperCase && hasSpecial;
  }

  defaultMessage(): string {
    return 'Password minimal 8 karakter, mengandung 1 huruf besar, dan 1 karakter spesial';
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
