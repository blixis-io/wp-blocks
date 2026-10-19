<?php
/** Tests for the versioned Plus plan entitlement contract.
 *
 * @package Blixis\Builder\Tests
 */

declare(strict_types=1);

use Blixis\Plus\PlanEntitlement;
use PHPUnit\Framework\TestCase;

require_once dirname( __DIR__, 2 ) . '/plus/src/PlanEntitlement.php';

/** Tests server-authoritative plan resolution. */
final class PlanEntitlementTest extends TestCase {
	/** Only a strict grant for a supported plan is accepted. */
	public function test_only_strictly_granted_supported_plans_are_active(): void {
		$entitlement = new PlanEntitlement( static fn( string $plan, int $version ): bool => 'pro' === $plan && 1 === $version );

		self::assertTrue( $entitlement->has_plan( 'pro' ) );
		self::assertFalse( $entitlement->has_plan( 'plus' ) );
		self::assertFalse( $entitlement->has_plan( 'enterprise' ) );
	}

	/** No entitlement provider means no paid access. */
	public function test_no_provider_means_no_plan(): void {
		self::assertFalse( ( new PlanEntitlement() )->has_plan( 'pro' ) );
	}
}
