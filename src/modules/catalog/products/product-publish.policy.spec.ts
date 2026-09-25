import { evaluatePublishReadiness, type ProductPublishSnapshot } from './product-publish.policy';

const ready: ProductPublishSnapshot = {
  status: 'DRAFT',
  productType: 'STANDARD',
  activeVariants: [{ prices: [{}], bundleDefinition: null }],
  hasPrimaryImage: true,
  availableStock: 5,
};

describe('evaluatePublishReadiness', () => {
  it('allows a DRAFT product with a priced SKU and a primary image', () => {
    expect(evaluatePublishReadiness(ready)).toEqual({ canPublish: true, blockingIssues: [], warnings: [] });
  });

  it('blocks without a primary image', () => {
    const result = evaluatePublishReadiness({ ...ready, hasPrimaryImage: false });

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map(({ code }) => code)).toEqual(['MISSING_PRIMARY_IMAGE']);
  });

  it('only warns when no branch has stock — publishing is chain-wide, stock is per branch', () => {
    const result = evaluatePublishReadiness({ ...ready, availableStock: 0 });

    expect(result.canPublish).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toEqual(['NO_AVAILABLE_STOCK']);
  });

  it('lists every blocking issue at once so the checklist can show them together', () => {
    const result = evaluatePublishReadiness({
      ...ready,
      activeVariants: [{ prices: [], bundleDefinition: { status: 'ACTIVE', items: [] } }],
      hasPrimaryImage: false,
    });

    expect(result.blockingIssues.map(({ code }) => code)).toEqual([
      'NO_SELLABLE_VARIANT',
      'STANDARD_HAS_BUNDLE_VARIANT',
      'MISSING_PRIMARY_IMAGE',
    ]);
  });

  it('never allows publishing a product that is not DRAFT', () => {
    expect(evaluatePublishReadiness({ ...ready, status: 'PUBLISHED' }).canPublish).toBe(false);
  });
});
