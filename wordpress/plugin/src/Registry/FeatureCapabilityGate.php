<?php
/** Server-authoritative capability checks for extension features.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Registry;

\defined( 'ABSPATH' ) || exit;

/** Resolves a versioned capability through the add-on supplied server filter. */
final class FeatureCapabilityGate {
	public const API_VERSION = 1;

	/** Optional resolver for pure tests and non-WordPress hosts.
	 *
	 * @var callable(string,int):bool|null
	 */
	private $resolver;

	/** Create the gate.
	 *
	 * @param ?callable(string,int):bool $resolver Optional entitlement resolver.
	 */
	public function __construct( ?callable $resolver = null ) {
		$this->resolver = $resolver;
	}

	/** Whether an extension may create or edit this capability.
	 *
	 * @param string $capability Namespaced capability id.
	 */
	public function allows( string $capability ): bool {
		if ( 1 !== \preg_match( '~^[a-z][a-z0-9-]{1,31}/[a-z][a-z0-9-]{1,63}$~D', $capability ) ) {
			return false;
		}
		if ( null !== $this->resolver ) {
			return true === ( $this->resolver )( $capability, self::API_VERSION );
		}
		if ( ! \function_exists( 'apply_filters' ) ) {
			return false;
		}
		return true === \apply_filters( 'blixis_builder_capability_available', false, $capability, self::API_VERSION );
	}
}
