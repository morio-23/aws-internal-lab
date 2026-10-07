import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VIRTUAL_REGION,
  SUPPORTED_VIRTUAL_REGIONS,
  assertVirtualRegion,
  generateVirtualAccountId,
  iamRoleArn,
  isVirtualAccountId,
  isVirtualRegion,
  regionalArn,
  route53HostedZoneArn,
  s3BucketArn,
} from "../../packages/aws-virtual/src/index.js";

test("supports only Tokyo and Osaka virtual regions", () => {
  assert.deepEqual(SUPPORTED_VIRTUAL_REGIONS, [
    "ap-northeast-1",
    "ap-northeast-3",
  ]);
  assert.equal(DEFAULT_VIRTUAL_REGION, "ap-northeast-1");
  assert.equal(isVirtualRegion("ap-northeast-1"), true);
  assert.equal(isVirtualRegion("ap-northeast-3"), true);
  assert.equal(isVirtualRegion("us-east-1"), false);
  assert.throws(() => assertVirtualRegion("us-east-1"));
});

test("generates 12 digit virtual account IDs", () => {
  for (let i = 0; i < 100; i += 1) {
    const id = generateVirtualAccountId();
    assert.match(id, /^\d{12}$/);
    assert.equal(isVirtualAccountId(id), true);
  }
});

test("formats regional and service-specific ARNs", () => {
  const accountId = "012345678901";

  assert.equal(
    regionalArn({
      service: "lambda",
      region: "ap-northeast-1",
      accountId,
      resource: "function:demo",
    }),
    "arn:aws:lambda:ap-northeast-1:012345678901:function:demo",
  );

  assert.equal(
    s3BucketArn("training-bucket"),
    "arn:aws:s3:::training-bucket",
  );
  assert.equal(
    iamRoleArn(accountId, "demo-role"),
    "arn:aws:iam::012345678901:role/demo-role",
  );
  assert.equal(
    route53HostedZoneArn("Z123"),
    "arn:aws:route53:::hostedzone/Z123",
  );
});
