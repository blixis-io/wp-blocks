<?php
/**
 * Global WordPress hook stubs for storage registration tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

/** Captured hook registrations and a fake current user's capability. */
final class HookState {
		/** Captured callbacks.
		 *
		 * @var array<string, array<mixed>>
		 */
	public static array $actions = [];
		/** Captured filters.
		 *
		 * @var array<string, array<mixed>>
		 */
	public static array $filters = [];
		/** Registered meta.
		 *
		 * @var list<array{string,string,array<string,mixed>}>
		 */
	public static array $meta = [];
		/** Current edit permission.
		 *
		 * @var bool
		 */
	public static bool $can_edit = true;
}
