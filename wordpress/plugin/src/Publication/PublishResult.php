<?php
/**
 * Outcome of a publish or rollback.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** Success with the new pointer revision, or a stable error code with HTTP status and details. */
final class PublishResult {
	/**
	 * Create a result.
	 *
	 * @param int                  $status HTTP status.
	 * @param ?string              $code Error code, null on success.
	 * @param array<string, mixed> $data Details (revisions, snapshot numbers, impact lists).
	 */
	private function __construct( public readonly int $status, public readonly ?string $code, public readonly array $data ) {}

	/**
	 * Success.
	 *
	 * @param array<string, mixed> $data Details.
	 * @return self
	 */
	public static function ok( array $data ): self {
		return new self( 200, null, $data );
	}

	/**
	 * Failure.
	 *
	 * @param int                  $status HTTP status.
	 * @param string               $code Stable code.
	 * @param array<string, mixed> $data Details.
	 * @return self
	 */
	public static function error( int $status, string $code, array $data = [] ): self {
		return new self( $status, $code, $data );
	}
}
