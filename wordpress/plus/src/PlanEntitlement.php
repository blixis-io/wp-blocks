<?php
/** Versioned Plus plan entitlement contract.
 *
 * @package Blixis\Plus
 */

declare(strict_types=1);

namespace Blixis\Plus;

/** Resolves a plan through an explicit server-side entitlement provider. */
final class PlanEntitlement {
	public const API_VERSION = 1;

	/** Optional resolver for deterministic tests.
	 *
	 * @var callable(string,int):bool|null
	 */
	private $resolver;

	/** Create a plan resolver.
	 *
	 * @param ?callable(string,int):bool $resolver Optional plan provider.
	 */
	public function __construct( ?callable $resolver = null ) {
		$this->resolver = $resolver;
	}

	/** Whether a supported Plus plan is active.
	 *
	 * @param string $plan Plan identifier.
	 */
	public function has_plan( string $plan ): bool {
		if ( ! in_array( $plan, [ 'plus', 'pro' ], true ) ) {
			return false;
		}
		if ( null !== $this->resolver ) {
			return true === ( $this->resolver )( $plan, self::API_VERSION );
		}
		if ( ! function_exists( 'apply_filters' ) ) {
			return false;
		}
		return true === apply_filters( 'blixis_plus_plan_active', false, $plan, self::API_VERSION );
	}
}
