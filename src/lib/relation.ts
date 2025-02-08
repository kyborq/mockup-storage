import { MockView } from "./record";

abstract class BaseMockRelation<S, T> {
  private source: keyof MockView<S>;
  private target: keyof MockView<T>;

  constructor(source: keyof MockView<S>, target: keyof MockView<T>) {
    this.source = source;
    this.target = target;
  }
}

export class OneOne<S, T> extends BaseMockRelation<S, T> {}

export class OneMany<S, T> extends BaseMockRelation<S, T> {}

export const MockRelation = {
  OneMany,
  OneOne,
};
