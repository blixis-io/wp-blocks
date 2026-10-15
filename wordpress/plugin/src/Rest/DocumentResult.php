<?php
/**
 * Transport-neutral result of a document request.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

\defined( 'ABSPATH' ) || exit;

/** Carries only safe response data across the WordPress boundary. */
final class DocumentResult {
	/**
	 * Create a transport-neutral response.
	 *
	 * @param int                  $status HTTP status.
	 * @param array<string, mixed> $body Response body or error data.
	 * @param string|null          $error_code Stable error code.
	 * @param string|null          $message Safe message.
	 * @param int|null             $revision Response ETag revision.
	 */
	private function __construct(
		public readonly int $status,
		public readonly array $body,
		public readonly ?string $error_code,
		public readonly ?string $message,
		public readonly ?int $revision
	) {}

	/**
	 * Create a success response.
	 *
	 * @param array<string, mixed> $body Response body.
	 * @param int                  $revision Revision for ETag.
	 */
	public static function success( array $body, int $revision ): self {
		return new self( 200, $body, null, null, $revision );
	}

	/**
	 * Create a safe error response.
	 *
	 * @param int                  $status HTTP status.
	 * @param string               $code Stable code.
	 * @param string               $message Safe message.
	 * @param array<string, mixed> $data Additional safe error data.
	 */
	public static function error( int $status, string $code, string $message, array $data = [] ): self {
		unset( $message );
		return new self( $status, $data, $code, ErrorCatalog::message( $code ), null );
	}
}
