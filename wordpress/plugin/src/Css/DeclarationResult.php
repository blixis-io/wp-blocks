<?php
/**
 * DeclarationResult implementation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

/** DeclarationResult contract. */
final class DeclarationResult {
	/**
	 * Construct a declaration result.
	 *
	 * @param bool   $ok Ok.
	 * @param string $name Name.
	 * @param string $value Value.
	 * @param string $code Code.
	 * @param string $message Message.
	 */
	public function __construct(
		public readonly bool $ok,
		public readonly string $name = '',
		public readonly string $value = '',
		public readonly string $code = '',
		public readonly string $message = ''
	) {}

	/**
	 * Create a failed validation result.
	 *
	 * @param string $code Failure code.
	 * @param string $message Failure message.
	 */
	public static function failure( string $code, string $message ): self {
		return new self( false, '', '', $code, $message );
	}
}
