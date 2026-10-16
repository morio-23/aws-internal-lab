import {
  CfnOutput,
  CfnParameter,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class PlatformRuntimeConnectivityStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const peeringConnectionId = new CfnParameter(
      this,
      "RuntimeVpcPeeringConnectionId",
      {
        type: "String",
        description: "Peering connection created by the RuntimeStack",
        allowedPattern: "^pcx-[0-9a-fA-F]+$",
      },
    );
    const runtimeVpcCidr = new CfnParameter(this, "RuntimeVpcCidr", {
      type: "String",
      default: "10.30.0.0/16",
      description: "Runtime VPC CIDR reachable from Platform private subnets",
    });
    const routeTableIdA = new CfnParameter(
      this,
      "PlatformPrivateRouteTableIdA",
      {
        type: "String",
        description: "Platform private route table for AZ A",
        allowedPattern: "^rtb-[0-9a-fA-F]+$",
      },
    );
    const routeTableIdB = new CfnParameter(
      this,
      "PlatformPrivateRouteTableIdB",
      {
        type: "String",
        description: "Platform private route table for AZ B",
        allowedPattern: "^rtb-[0-9a-fA-F]+$",
      },
    );

    const routeA = new ec2.CfnRoute(this, "RuntimeRouteA", {
      routeTableId: routeTableIdA.valueAsString,
      destinationCidrBlock: runtimeVpcCidr.valueAsString,
      vpcPeeringConnectionId: peeringConnectionId.valueAsString,
    });
    const routeB = new ec2.CfnRoute(this, "RuntimeRouteB", {
      routeTableId: routeTableIdB.valueAsString,
      destinationCidrBlock: runtimeVpcCidr.valueAsString,
      vpcPeeringConnectionId: peeringConnectionId.valueAsString,
    });

    new CfnOutput(this, "RuntimeRouteAId", {
      value: routeA.ref,
    });
    new CfnOutput(this, "RuntimeRouteBId", {
      value: routeB.ref,
    });
  }
}
